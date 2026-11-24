import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, OPTIONS"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="GET")return reply({error:"Método não permitido."},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!;
  const raw=Deno.env.get("SUPABASE_SECRET_KEYS");
  const service=raw?JSON.parse(raw).default:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!service)return reply({error:"Serviço indisponível."},503);
  const admin=createClient(url,service);
  const {data,error}=await admin.from("platform_settings").select("setting_key,setting_value").in("setting_key",["support_chat_enabled","new_registrations_enabled","public_notice"]);
  if(error)throw error;
  const settings=Object.fromEntries((data||[]).map(row=>[row.setting_key,row.setting_value]));
  return reply({support_chat_enabled:settings.support_chat_enabled!==false,new_registrations_enabled:settings.new_registrations_enabled!==false,public_notice:typeof settings.public_notice==="string"?settings.public_notice:""});
 }catch(error){return reply({error:error instanceof Error?error.message:"Falha ao carregar configurações."},500);}
});