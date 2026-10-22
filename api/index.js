import OpenAI, { toFile } from 'openai';
import Busboy from 'busboy';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(await fs.readFile(path.join(root,'catalog.json'),'utf8'));
function parseMultipart(req){return new Promise((resolve,reject)=>{const bb=Busboy({headers:req.headers,limits:{fileSize:15*1024*1024,files:1,fields:10}});const fields={};let roomFile=null;bb.on('field',(n,v)=>fields[n]=v);bb.on('file',(n,s,info)=>{if(n!=='roomImage'){s.resume();return}const chunks=[];s.on('data',c=>chunks.push(c));s.on('end',()=>roomFile={buffer:Buffer.concat(chunks),filename:info.filename,mimeType:info.mimeType})});bb.on('finish',()=>resolve({fields,roomFile}));bb.on('error',reject);req.pipe(bb)})}
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data))}
export default async function handler(req,res){
const url=new URL(req.url,`https://${req.headers.host||'localhost'}`);
if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,aiConfigured:Boolean(process.env.OPENAI_API_KEY),model:'gpt-image-2'});
if(req.method!=='POST'||url.pathname!=='/api/generate')return json(res,404,{error:'Route introuvable.'});
if(!process.env.OPENAI_API_KEY)return json(res,503,{error:'La génération IA nécessite OPENAI_API_KEY dans les variables d’environnement Vercel. L’API OpenAI est distincte de l’abonnement ChatGPT et peut nécessiter des crédits payants.'});
try{
const {fields,roomFile}=await parseMultipart(req);
if(!roomFile)return json(res,400,{error:'Ajoutez une photo de pièce.'});
if(!/^image\/(jpeg|png|webp)$/.test(roomFile.mimeType))return json(res,400,{error:'Formats acceptés : JPG, PNG ou WebP.'});
const ids=JSON.parse(fields.productIds||'[]');
if(!Array.isArray(ids)||!ids.length)return json(res,400,{error:'Sélectionnez au moins un produit.'});
if(ids.length>4)return json(res,400,{error:'Sélectionnez au maximum 4 produits par génération.'});
const selected=ids.map(id=>catalog.find(p=>p.id===id)).filter(Boolean);
if(!selected.length)return json(res,400,{error:'Aucune référence produit valide.'});
const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
const roomImage=await toFile(roomFile.buffer,roomFile.filename||'room.jpg',{type:roomFile.mimeType});
const refs=[];
for(const p of selected){try{const buf=await fs.readFile(path.join(root,'public',p.image));const ext=path.extname(p.image).toLowerCase();const mime=ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg';refs.push(await toFile(buf,path.basename(p.image),{type:mime}))}catch(e){console.warn('Référence produit absente',p.id)}}
const productList=selected.map((p,i)=>`${i+1}. ${p.name} — marque ${p.brand||'Centrakor'}`).join('\n');
const prompt=`Edit the first supplied image, the customer's room photo, into one photorealistic interior visualization. Additional images, if present, are product reference photos in this exact order: ${selected.map((p,i)=>`${i+1}: ${p.name}`).join('; ')}.
Add the selected products naturally into the existing room. Match each product reference as closely as possible, preserving silhouette, color, material and design. Choose a plausible position based on product type and room layout. Keep the room's architecture, camera angle, windows, doors, walls, floors and fixed features unchanged. Integrate the products with realistic size, perspective, lighting, contact shadows and occlusion. If a reference photo has a white background, do not reproduce the background, only the product. Do not add people, text, prices, logos, watermarks or unrelated decor. Return only the final edited image.
Selected products:
${productList}`;
const result=await client.images.edit({model:'gpt-image-2',image:[roomImage,...refs],prompt,size:'1536x1024',quality:'high'});
const b64=result?.data?.[0]?.b64_json;
if(!b64)return json(res,502,{error:'Le modèle IA n’a pas retourné d’image.'});
return json(res,200,{image:`data:image/png;base64,${b64}`,products:selected,generated:true,referenceCount:refs.length});
}catch(error){console.error(error);const message=error?.status===429?'Le compte API OpenAI n’a plus de crédits ou a atteint sa limite. Vérifiez la facturation API.':error?.message||'Erreur pendant la génération IA.';return json(res,500,{error:message})}
}