import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { supabase } from '@/services/supabase/client';
import { saveProduct } from './api';

type ProductRow={Nom?:unknown;Code_barres?:unknown;Unite?:unknown;Prix_achat?:unknown;Prix_vente?:unknown;Stock_initial?:unknown;Seuil_stock_faible?:unknown};
const units=new Set(['piece','carton','kg','litre','sac','paquet']);
export type ImportPreview={row:number;name:string;valid:boolean;error?:string;data?:ProductRow};

export async function selectProductWorkbook(companyId:string,storeId:string):Promise<ImportPreview[]|null>{
  const result=await DocumentPicker.getDocumentAsync({type:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'],copyToCacheDirectory:true});
  if(result.canceled)return null;const asset=result.assets[0];
  if((asset.size??0)>5*1024*1024)throw new Error('Le fichier dépasse la limite de 5 Mo.');
  // SM-17 (audit externe) : import dynamique plutôt qu'en tête de fichier —
  // XLSX (SheetJS) est une bibliothèque volumineuse qui ne sert qu'ici, sur
  // un écran que la plupart des utilisateurs n'ouvrent jamais. En import
  // statique, tout le monde la télécharge dès le premier chargement de
  // l'app ; en import dynamique, seul un vrai import de fichier la charge.
  const XLSX = await import('@e965/xlsx');
  const bytes=await new File(asset.uri).bytes();const book=XLSX.read(bytes,{type:'array'});const firstSheet=book.SheetNames[0];
  if(!firstSheet||!book.Sheets[firstSheet])throw new Error('Le fichier Excel ne contient aucune feuille.');
  const rows=XLSX.utils.sheet_to_json<ProductRow>(book.Sheets[firstSheet],{defval:''});if(rows.length>1000)throw new Error('Un import est limité à 1 000 produits.');
  // L'import crée toujours de nouveaux produits (jamais une mise à jour d'un
  // produit existant) — sans ce contrôle, réimporter deux fois le même
  // fichier (ex. un tarif corrigé) recréait silencieusement chaque produit
  // en double. Comparaison insensible à la casse, comme la vérification déjà
  // en place à la création manuelle d'un produit (findSimilarProduct).
  const{data:existingRows}=await supabase.from('products').select('name').eq('company_id',companyId).eq('store_id',storeId).eq('is_active',true);
  const existingNames=new Set((existingRows??[]).map(row=>String(row.name).trim().toLowerCase()));
  const seen=new Set<string>();return rows.map((data,index)=>{const name=String(data.Nom??'').trim();const normalizedName=name.toLowerCase();const duplicate=seen.has(normalizedName);const alreadyExists=!duplicate&&existingNames.has(normalizedName);if(normalizedName)seen.add(normalizedName);const unit=String(data.Unite??'piece').trim().toLowerCase();const numbers=[data.Prix_achat,data.Prix_vente,data.Stock_initial,data.Seuil_stock_faible].map(Number);const error=name.length<2?'Nom manquant':duplicate?'Produit dupliqué dans le fichier':alreadyExists?'Produit déjà existant dans la boutique':!units.has(unit)?'Unité invalide':numbers.some(value=>!Number.isFinite(value)||value<0)?'Prix, stock ou seuil invalide':undefined;return{row:index+2,name,valid:!error,error,data}});
}

export async function importProductRows(companyId:string,storeId:string,rows:ImportPreview[]){const errors:string[]=[];let imported=0;for(const row of rows.filter(item=>item.valid&&item.data)){const data=row.data!;try{await saveProduct(companyId,storeId,{name:row.name,description:'',sku:'',barcode:String(data.Code_barres??'').trim(),supplierId:null,unit:String(data.Unite??'piece').trim().toLowerCase() as 'piece',purchasePrice:String(data.Prix_achat),salePrice:String(data.Prix_vente),initialQuantity:String(data.Stock_initial),lowStockThreshold:String(data.Seuil_stock_faible),isActive:true});imported+=1}catch(error){errors.push(`Ligne ${row.row}: ${error instanceof Error?error.message:'Erreur'}`)}}return{imported,errors}}
