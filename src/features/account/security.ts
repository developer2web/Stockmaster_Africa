import { supabase } from '@/services/supabase/client';

export async function listMfaFactors(){const{data,error}=await supabase.auth.mfa.listFactors();if(error)throw new Error(error.message);return data.totp;}
export async function beginMfaEnrollment(){const{data,error}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'StockMaster'});if(error)throw new Error(error.message);return data;}
export async function verifyMfaEnrollment(factorId:string,code:string){const{error}=await supabase.auth.mfa.challengeAndVerify({factorId,code:code.trim()});if(error)throw new Error(error.message);await supabase.rpc('record_security_event',{p_event_type:'mfa_enabled',p_device_label:'StockMaster'});}
export async function removeMfaFactor(factorId:string){const{error}=await supabase.auth.mfa.unenroll({factorId});if(error)throw new Error(error.message);await supabase.rpc('record_security_event',{p_event_type:'mfa_disabled',p_device_label:'StockMaster'});}
export async function signOutAllDevices(){await supabase.rpc('record_security_event',{p_event_type:'global_logout',p_device_label:'StockMaster'});const{error}=await supabase.auth.signOut({scope:'global'});if(error)throw new Error(error.message);}
export type SecurityEvent={id:string;event_type:string;device_label:string|null;created_at:string};
export async function getSecurityEvents():Promise<SecurityEvent[]>{const{data,error}=await supabase.from('user_security_events').select('id,event_type,device_label,created_at').order('created_at',{ascending:false}).limit(30);if(error)throw new Error(error.message);return(data??[]) as SecurityEvent[];}
