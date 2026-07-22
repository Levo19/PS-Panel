const {Client}=require('pg');const fs=require('fs');
const PASS=process.env.PGPASS||fs.readFileSync('.pgpass','utf8').trim();
const c=new Client({host:'aws-1-us-west-2.pooler.supabase.com',port:5432,user:'postgres.lintmcxqxnrholslatul',password:PASS,database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{await c.connect();try{
  const f=(await c.query("select proname from pg_proc where prokind='f' and pronamespace='public'::regnamespace and pg_get_functiondef(oid) ilike '%nombre_contacto%'")).rows;
  console.log('funciones que referencian nombre_contacto:'); f.forEach(x=>console.log('  '+x.proname));
}catch(e){console.error('ERR',e.message)}finally{await c.end();}})();
