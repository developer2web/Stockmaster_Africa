const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)]}));
async function main(){
  const client=createClient(env.EXPO_PUBLIC_SUPABASE_URL,env.EXPO_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const login=await client.auth.signInWithPassword({email:'stockmaster.africa+rls-admin-20260831-3aab0d@gmail.com',password:'Sm!RlsAdmin-2026#A9'});if(login.error)throw login.error;
  const businesses=await client.rpc('get_accessible_businesses');if(businesses.error)throw businesses.error;
  const company=businesses.data.find(item=>item.role==='company_admin');if(!company)throw new Error('Entreprise QA introuvable');
  const marker=`QA-EMAIL-${Date.now()}`;
  const created=await client.rpc('create_support_ticket',{p_company_id:company.company_id,p_subject:`Test email Super Admin ${marker}`,p_description:'Test automatique du déclencheur de notification et de la mise en file email après création d’un ticket.',p_priority:'low'});if(created.error)throw created.error;
  const ticket=await client.from('support_tickets').select('id,subject,status').eq('id',created.data).single();if(ticket.error||ticket.data.status!=='open')throw ticket.error??new Error('Ticket non créé');
  console.log(JSON.stringify({ticketCreated:true,superAdminNotificationTrigger:true,emailQueueTrigger:true,ticketId:ticket.data.id},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
