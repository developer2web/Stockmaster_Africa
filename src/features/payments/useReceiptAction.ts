import { useCallback, useState } from 'react';

export function useReceiptAction(){
  const[runningKey,setRunningKey]=useState<string|null>(null);
  const[error,setError]=useState('');
  const run=useCallback(async(key:string,action:()=>Promise<void>)=>{
    if(runningKey)return;
    setRunningKey(key);setError('');
    try{await action();}catch(value){setError(value instanceof Error?value.message:'Impossible de générer le reçu. Réessayez.');}
    finally{setRunningKey(null);}
  },[runningKey]);
  return{run,runningKey,error,clearError:()=>setError('')};
}
