import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc=vi.hoisted(()=>vi.fn());
const from=vi.hoisted(()=>vi.fn());
const getItem=vi.hoisted(()=>vi.fn());

vi.mock('@/services/supabase/client',()=>({supabase:{rpc,from}}));
vi.mock('@react-native-async-storage/async-storage',()=>({default:{getItem,setItem:vi.fn(),removeItem:vi.fn(),getAllKeys:vi.fn(),multiRemove:vi.fn()}}));
vi.mock('expo-crypto',()=>({randomUUID:()=> 'operation-test'}));

import { lookupProductCode } from '../src/features/inventory/api';

const cached=[{stockLevelId:'stock-1',productId:'nido',variantId:null,categoryId:null,categoryName:null,unit:'piece',name:'NIDO',sku:'NIDO-1',lookupCodes:['1234567890123'],salePrice:100,purchasePrice:70,available:3,imageUrl:null}];

describe('recherche par code-barres',()=>{
  beforeEach(()=>{rpc.mockReset();from.mockReset();getItem.mockReset();});

  it('retrouve immédiatement un produit connu en ligne',async()=>{
    rpc.mockResolvedValue({data:[{product_id:'nido',variant_id:null}],error:null});
    await expect(lookupProductCode('1234567890123','store-1','company-1')).resolves.toMatchObject({productId:'nido',variantId:null,storeId:'store-1'});
  });

  it('retrouve un produit synchronisé lorsque le réseau est indisponible',async()=>{
    rpc.mockResolvedValue({data:null,error:{message:'Network request failed'}});
    getItem.mockResolvedValue(JSON.stringify({value:cached,savedAt:new Date().toISOString()}));
    await expect(lookupProductCode('1234567890123','store-1','company-1')).resolves.toMatchObject({productId:'nido',productName:'NIDO',storeId:'store-1'});
  });
});
