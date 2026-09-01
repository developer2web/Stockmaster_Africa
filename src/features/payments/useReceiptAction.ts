import { useCallback, useState } from 'react';
import { userErrorMessage } from '@/utils/errors';
import { logger } from '@/services/observability/logger';

export function useReceiptAction(){
  const[runningKey,setRunningKey]=useState<string|null>(null);
  const[error,setError]=useState('');
  const run=useCallback(async(key:string,action:()=>Promise<void>)=>{
    if(runningKey)return;
    setRunningKey(key);setError('');
    try{await action();}catch(value){void logger.error('receipt_action_failed',value,{key});setError(userErrorMessage(value,'Impossible de générer le reçu. Réessayez.'));}
    finally{setRunningKey(null);}
  },[runningKey]);
  return{run,runningKey,error,clearError:()=>setError('')};
}
