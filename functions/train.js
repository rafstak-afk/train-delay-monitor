// router fix placeholder
export async function onRequest(context){
 const url=new URL(context.request.url);
 const action=url.searchParams.get('action');
 if(action==='station-names'){
  return new Response(JSON.stringify({ok:true,router:'station-names'}),{headers:{'content-type':'application/json'}})
 }
 if(action==='debug'){
  return new Response(JSON.stringify({ok:true,router:'debug'}),{headers:{'content-type':'application/json'}})
 }
 return new Response('TRAIN HTML PLACEHOLDER',{headers:{'content-type':'text/html'}})
}
