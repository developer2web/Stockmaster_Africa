import { supabase } from '@/services/supabase/client';
export type InternalNotification={id:string;type:string;severity:string;title:string;body:string};
export async function getInternalNotifications(storeId:string):Promise<InternalNotification[]>{const{data,error}=await supabase.rpc('get_internal_notifications',{p_store_id:storeId});if(error)throw new Error(error.message);return(data??[]) as InternalNotification[]}
