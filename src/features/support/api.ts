import { supabase } from '@/services/supabase/client';
export type Ticket={id:string;subject:string;description:string;priority:string;status:string;resolution:string|null;created_at:string};
const fail=(error:{message:string}|null)=>{if(error)throw new Error(error.message)};
export async function getMyTickets(companyId:string):Promise<Ticket[]>{const{data,error}=await supabase.from('support_tickets').select('id,subject,description,priority,status,resolution,created_at').eq('company_id',companyId).order('created_at',{ascending:false});fail(error);return(data??[]) as Ticket[]}
export async function createTicket(companyId:string,subject:string,description:string,priority:string){const{data,error}=await supabase.rpc('create_support_ticket',{p_company_id:companyId,p_subject:subject,p_description:description,p_priority:priority});fail(error);return data as string}
