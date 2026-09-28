import OpenAI, { toFile } from 'openai';
import Busboy from 'busboy';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const catalog=JSON.parse(await fs.readFile(path.join(root,'catalog.json'),'utf8'));

function pickProducts(budget,style){
  const max=Number.isFinite(budget)?budget:1000;
  const preferred=catalog.filter(p=>p.price<=max&&p.styles?.includes(style));
  const fallback=catalog.filter(p=>p.price<=max);
  return [...new Map([...preferred,...fallback].map(p=>[p.id,p])).values()].slice(0,6);
}
function parseMultipart(req){
  return new Promise((resolve,reject)=>{
    const bb=Busboy({headers:req.headers,limits:{fileSize:15*1024*1024,files:1,fields:10}});
    const fields={};let roomFile=null;
    bb.on('field',(name,value)=>fields[name]=value);
    bb.on('file',(name,stream,info)=>{
      if(name!=='roomImage'){stream.resume();return;}
      const chunks=[];stream.on('data',c=>chunks.push(c));
      stream.on('end',()=>roomFile={buffer:Buffer.concat(chunks),filename:info.filename,mimeType:info.mimeType});
    });
    bb.on('finish',()=>resolve({fields,roomFile}));bb.on('error',reject);req.pipe(bb);
  });
}
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));}

export default async function handler(req,res){
  const url=new URL(req.url,\`https://\${req.headers.host||'localhost'}\`);
  if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,aiConfigured:Boolean(process.env.OPENAI_API_KEY),model:'gpt-image-2'});
  if(req.method!=='POST'||url.pathname!=='/api/generate')return json(res,404,{error:'Route introuvable.'});
  if(!process.env.OPENAI_API_KEY)return json(res,503,{error:'OPENAI_API_KEY n’est pas configurée sur le serveur.'});
  try{
    const {fields,roomFile}=await parseMultipart(req);
    if(!roomFile)return json(res,400,{error:'Ajoutez une photo de pièce.'});
    if(!/^image\/(jpeg|png|webp)$/.test(roomFile.mimeType))return json(res,400,{error:'Formats acceptés : JPG, PNG ou WebP.'});
    const room=fields.room||'Salon',style=fields.style||'Contemporain',budget=Number(fields.budget||1000);
    const selected=pickProducts(budget,style),client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const roomImage=await toFile(roomFile.buffer,roomFile.filename||'room.jpg',{type:roomFile.mimeType});
    const referenceFiles=[];let referenceCount=0;
    for(const product of selected){
      if(!product.image)continue;
      try{
        const buf=await fs.readFile(path.join(root,'public',product.image));
        referenceFiles.push(await toFile(buf,path.basename(product.image),{type:'image/jpeg'}));referenceCount++;
      }catch{}
    }
    const productList=selected.map((p,i)=>`${i+1}. ${p.name} — ${p.price.toFixed(2)} €`).join('\n');
    const prompt=`You are Centrakor Déco Vision. Edit the customer's supplied room photo and return ONE photorealistic image of the SAME ROOM.
ROOM: ${room}
STYLE: ${style}
MAXIMUM SHOPPING BUDGET: ${budget} euros
Keep the same camera viewpoint, architecture, walls, floor, windows, doors and fixed elements. Preserve realistic scale, perspective and lighting. Do not add people, text, prices, logos or watermarks.
Commercial products selected:
${productList}
${referenceCount?'Reference product images are supplied. Match their appearance, material, color and proportions as closely as possible and use them naturally in the room.':'Use the product names only as conceptual guidance.'}
Return only the finished interior visualization.`;
    const result=await client.images.edit({model:'gpt-image-2',image:[roomImage,...referenceFiles],prompt,size:'1536x1024',quality:'high'});
    const b64=result?.data?.[0]?.b64_json;
    if(!b64)return json(res,502,{error:'Le modèle IA n’a pas retourné d’image.'});
    return json(res,200,{image:`data:image/png;base64,${b64}`,products:selected,generated:true,exactProductReferences:referenceCount>0,referenceCount,model:'gpt-image-2'});
  }catch(error){console.error(error);return json(res,500,{error:error?.message||'Erreur pendant la génération IA.'});}
}