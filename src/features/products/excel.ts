import * as DocumentPicker from 'expo-document-picker';
import { File,Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from '@e965/xlsx';
import { saveProduct } from './api';
import { supabase } from '@/services/supabase/client';

type ProductRow={Nom?:unknown;Code_barres?:unknown;Unite?:unknown;Prix_achat?:unknown;Prix_vente?:unknown;Stock_initial?:unknown;Seuil_stock_faible?:unknown};
const units=new Set(['piece','carton','kg','litre','sac','paquet']);
export type ImportPreview={row:number;name:string;valid:boolean;error?:string;data?:ProductRow};

export async function selectProductWorkbook():Promise<ImportPreview[]|null>{
  const result=await DocumentPicker.getDocumentAsync({type:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'],copyToCacheDirectory:true});
  if(result.canceled)return null;const asset=result.assets[0];
  if((asset.size??0)>5*1024*1024)throw new Error('Le fichier dépasse la limite de 5 Mo.');
  const bytes=await new File(asset.uri).bytes();const book=XLSX.read(bytes,{type:'array'});const firstSheet=book.SheetNames[0];
  if(!firstSheet||!book.Sheets[firstSheet])throw new Error('Le fichier Excel ne contient aucune feuille.');
  const rows=XLSX.utils.sheet_to_json<ProductRow>(book.Sheets[firstSheet],{defval:''});if(rows.length>1000)throw new Error('Un import est limité à 1 000 produits.');
  const seen=new Set<string>();return rows.map((data,index)=>{const name=String(data.Nom??'').trim();const normalizedName=name.toLowerCase();const duplicate=seen.has(normalizedName);if(normalizedName)seen.add(normalizedName);const unit=String(data.Unite??'piece').trim().toLowerCase();const numbers=[data.Prix_achat,data.Prix_vente,data.Stock_initial,data.Seuil_stock_faible].map(Number);const error=name.length<2?'Nom manquant':duplicate?'Produit dupliqué dans le fichier':!units.has(unit)?'Unité invalide':numbers.some(value=>!Number.isFinite(value)||value<0)?'Prix, stock ou seuil invalide':undefined;return{row:index+2,name,valid:!error,error,data}});
}

export async function importProductRows(companyId:string,storeId:string,rows:ImportPreview[]){const errors:string[]=[];let imported=0;for(const row of rows.filter(item=>item.valid&&item.data)){const data=row.data!;try{await saveProduct(companyId,storeId,{name:row.name,description:'',sku:'SKU-AUTO',barcode:String(data.Code_barres??'').trim(),categoryId:null,supplierId:null,unit:String(data.Unite??'piece').trim().toLowerCase() as 'piece',purchasePrice:String(data.Prix_achat),salePrice:String(data.Prix_vente),initialQuantity:String(data.Stock_initial),lowStockThreshold:String(data.Seuil_stock_faible),isActive:true});imported+=1}catch(error){errors.push(`Ligne ${row.row}: ${error instanceof Error?error.message:'Erreur'}`)}}return{imported,errors}}

async function shareBook(book:XLSX.WorkBook,filename:string,title:string){const bytes=XLSX.write(book,{type:'array',bookType:'xlsx'}) as ArrayBuffer;const file=new File(Paths.cache,filename);file.create({overwrite:true,intermediates:true});file.write(new Uint8Array(bytes));if(!(await Sharing.isAvailableAsync()))throw new Error('Le partage de fichiers n’est pas disponible.');await Sharing.shareAsync(file.uri,{mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',dialogTitle:title})}
export async function shareProductTemplate(){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{Nom:'Exemple produit',Code_barres:'',Unite:'piece',Prix_achat:1000,Prix_vente:1500,Stock_initial:10,Seuil_stock_faible:3}]),'Produits');await shareBook(book,'StockMaster_Modele_Produits.xlsx','Modèle produits StockMaster')}
export async function shareProductsExport(companyId:string,storeId:string){const{data,error}=await supabase.from('products').select('name,sku,barcode,unit,purchase_price,sale_price,low_stock_threshold,is_active,stock_levels!inner(quantity,store_id)').eq('company_id',companyId).eq('store_id',storeId).eq('stock_levels.store_id',storeId).order('name');if(error)throw new Error(error.message);const rows=(data??[]).map(row=>({Nom:row.name,SKU:row.sku,Code_barres:row.barcode??'',Unite:row.unit,Prix_achat:row.purchase_price,Prix_vente:row.sale_price,Stock:(row.stock_levels as {quantity:number}[]).reduce((sum,item)=>sum+Number(item.quantity),0),Seuil_stock_faible:row.low_stock_threshold,Actif:row.is_active?'Oui':'Non'}));const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),'Stock');await shareBook(book,`StockMaster_Stock_${new Date().toISOString().slice(0,10)}.xlsx`,'Exporter le stock Excel')}
