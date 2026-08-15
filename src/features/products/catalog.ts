import { Share } from 'react-native';
import type { Product } from '@/types/database';
export async function shareProductCatalog(companyName:string,products:Product[],formatMoney:(amount:number)=>string){
  const active=products.filter(product=>product.is_active).slice(0,100);
  const lines=active.map(product=>`• ${product.name} — ${formatMoney(Number(product.sale_price))}`);
  await Share.share({title:`Catalogue ${companyName}`,message:[`🛍️ Catalogue ${companyName}`,'',...lines,'','Contactez-nous pour commander.'].join('\n')});
}
