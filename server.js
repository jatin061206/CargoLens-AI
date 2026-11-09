require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, "store.json");
const SECRET = process.env.JWT_SECRET || "local-demo-secret-change-before-deploy";
const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
const writeDB = db => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
if (!fs.existsSync(DB_FILE)) writeDB({ shipments: [
  { id:"SHP-24811", supplier:"Company B", origin:"China", status:"needs_review", documents:[
    {type:"invoice",name:"invoice-24811-demo.pdf",fields:{description:"LED panel light 40W",quantity:2400,unitPrice:6.8,currency:"USD",grossWeightKg:3120,total:16320},confidence:0.97},
    {type:"packing_list",name:"packing-list-24811-demo.pdf",fields:{description:"LED panel light 40W",quantity:2400,grossWeightKg:3165},confidence:0.95},
    {type:"bill_of_lading",name:"",fields:{},confidence:0}
  ],createdAt:new Date().toISOString() },
  { id:"SHP-24812", supplier:"Company C", origin:"Sweden", status:"incomplete", documents:[
    {type:"invoice",name:"invoice-24812-demo.pdf",fields:{description:"Steel ball valve DN50",quantity:180,unitPrice:42.5,currency:"EUR",grossWeightKg:1460,total:7650},confidence:0.96},
    {type:"packing_list",name:"",fields:{},confidence:0},
    {type:"bill_of_lading",name:"",fields:{},confidence:0}
  ],createdAt:new Date().toISOString() }
], audit: [] });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit:"2mb" }));
app.use(express.static(path.join(__dirname,"public")));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

const users = [
  { id:"u-exec", email:"executive@cargolens.demo", role:"executive", password: bcrypt.hashSync(process.env.DEMO_EXECUTIVE_PASSWORD || "Executive123!",10) },
  { id:"u-manager", email:"manager@cargolens.demo", role:"manager", password: bcrypt.hashSync(process.env.DEMO_MANAGER_PASSWORD || "Manager123!",10) }
];
function auth(req,res,next) {
  const token=(req.headers.authorization||"").replace(/^Bearer /,"");
  try { req.user=jwt.verify(token,SECRET); next(); } catch { res.status(401).json({error:"Please sign in again."}); }
}
function manager(req,res,next) { if(req.user.role!=="manager") return res.status(403).json({error:"Manager access required."}); next(); }
function log(db,user,action,shipmentId,details={}) { db.audit.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),user:user.email,action,shipmentId,details}); db.audit=db.audit.slice(0,500); }
function checks(shipment) {
  const by=Object.fromEntries(shipment.documents.map(d=>[d.type,d.fields||{}]));
  const inv=by.invoice||{}, pack=by.packing_list||{}, bol=by.bill_of_lading||{};
  const out=[];
  if(!shipment.documents.some(d=>d.type==="invoice"&&d.name)) out.push({code:"MISSING_INVOICE",severity:"blocking",message:"Invoice is missing."});
  if(!shipment.documents.some(d=>d.type==="packing_list"&&d.name)) out.push({code:"MISSING_PACKING_LIST",severity:"blocking",message:"Packing list is missing."});
  if(!shipment.documents.some(d=>d.type==="bill_of_lading"&&d.name)) out.push({code:"MISSING_BOL",severity:"blocking",message:"Bill of lading is missing."});
  if(inv.quantity!=null&&pack.quantity!=null&&Number(inv.quantity)!==Number(pack.quantity)) out.push({code:"QUANTITY_MISMATCH",severity:"blocking",message:`Quantity differs: invoice ${inv.quantity}, packing list ${pack.quantity}.`});
  if(inv.grossWeightKg!=null&&pack.grossWeightKg!=null&&Math.abs(Number(inv.grossWeightKg)-Number(pack.grossWeightKg))>0.01) out.push({code:"WEIGHT_MISMATCH",severity:"blocking",message:`Gross weight differs: invoice ${inv.grossWeightKg} kg, packing list ${pack.grossWeightKg} kg (difference ${Math.abs(Number(inv.grossWeightKg)-Number(pack.grossWeightKg))} kg).`});
  if(inv.quantity!=null&&inv.unitPrice!=null&&inv.total!=null&&Math.abs(Number(inv.quantity)*Number(inv.unitPrice)-Number(inv.total))>0.02) out.push({code:"INVOICE_TOTAL_MISMATCH",severity:"blocking",message:"Invoice total does not equal quantity × unit price."});
  if(bol.quantity!=null&&inv.quantity!=null&&Number(bol.quantity)!==Number(inv.quantity)) out.push({code:"BOL_QUANTITY_MISMATCH",severity:"blocking",message:"Bill of lading quantity differs from invoice."});
  if(bol.grossWeightKg!=null&&pack.grossWeightKg!=null&&Math.abs(Number(bol.grossWeightKg)-Number(pack.grossWeightKg))>0.01) out.push({code:"BOL_WEIGHT_MISMATCH",severity:"blocking",message:"Bill of lading gross weight differs from packing list."});
  for(const d of shipment.documents) if(d.name&&d.confidence>0&&d.confidence<0.8) out.push({code:"LOW_CONFIDENCE_"+d.type.toUpperCase(),severity:"blocking",message:`${d.type.replaceAll("_"," ")} extraction confidence is below 80%; review its fields.`});
  return out;
}
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024},fileFilter:(req,file,cb)=>cb(null,/\.(pdf|png|jpe?g|webp)$/i.test(file.originalname))});
app.post("/api/auth/login",async(req,res)=>{
  const {email,password}=req.body||{}; const u=users.find(x=>x.email===email);
  if(!u||!await bcrypt.compare(password||"",u.password)) return res.status(401).json({error:"Invalid email or password."});
  const token=jwt.sign({id:u.id,email:u.email,role:u.role},SECRET,{expiresIn:"8h"});
  res.json({token,user:{email:u.email,role:u.role}});
});
app.get("/api/me",auth,(req,res)=>res.json({user:req.user}));
app.get("/api/shipments",auth,(req,res)=>{const db=readDB();res.json(db.shipments.map(s=>({...s,checks:checks(s)})));});
app.get("/api/shipments/:id",auth,(req,res)=>{const s=readDB().shipments.find(x=>x.id===req.params.id);if(!s)return res.status(404).json({error:"Shipment not found."});res.json({...s,checks:checks(s)});});
app.post("/api/shipments",auth,(req,res)=>{
  const {id,supplier,origin}=req.body||{}; if(!id||!supplier)return res.status(400).json({error:"Shipment ID and supplier are required."});
  const db=readDB();if(db.shipments.some(s=>s.id===id))return res.status(409).json({error:"Shipment ID already exists."});
  const s={id,supplier,origin:origin||"—",status:"incomplete",documents:["invoice","packing_list","bill_of_lading"].map(type=>({type,name:"",fields:{},confidence:0})),createdAt:new Date().toISOString()};
  db.shipments.unshift(s);log(db,req.user,"shipment_created",id);writeDB(db);res.status(201).json(s);
});
app.post("/api/shipments/:id/documents/:type",auth,upload.single("file"),async(req,res)=>{
  if(!["invoice","packing_list","bill_of_lading"].includes(req.params.type))return res.status(400).json({error:"Unsupported document type."});
  if(!req.file)return res.status(400).json({error:"Choose a PDF or image (max 15 MB)."});
  const db=readDB(),s=db.shipments.find(x=>x.id===req.params.id);if(!s)return res.status(404).json({error:"Shipment not found."});
  const safe=crypto.randomUUID()+path.extname(req.file.originalname).toLowerCase();fs.writeFileSync(path.join(UPLOAD_DIR,safe),req.file.buffer);
  const doc=s.documents.find(d=>d.type===req.params.type);doc.name=req.file.originalname;doc.storageName=safe;doc.fields={};doc.confidence=0;doc.extractionStatus="uploaded";
  if(process.env.OPENAI_API_KEY) {
    try { const extracted=await extractWithAI(req.file,req.params.type);doc.fields=extracted.fields||{};doc.confidence=Number(extracted.confidence)||0;doc.extractionStatus="extracted"; }
    catch(e){doc.extractionStatus="failed";doc.extractionError="AI extraction failed. Enter values manually."; }
  } else { doc.extractionStatus="manual_review";doc.extractionError="AI is not configured. Enter values manually or add OPENAI_API_KEY."; }
  log(db,req.user,"document_uploaded",s.id,{type:doc.type,filename:doc.name,extractionStatus:doc.extractionStatus});writeDB(db);
  res.status(201).json({document:doc,checks:checks(s)});
});
async function extractWithAI(file,type) {
  const isPdf=file.mimetype==="application/pdf";
  const dataUrl=`data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const content=[{type:"input_text",text:`Extract customs document fields from this ${type.replaceAll("_"," ")}. Return JSON only with keys: fields (description, quantity, unitPrice, currency, grossWeightKg, total, invoiceNumber, date, packages, consignee, shipper) and confidence (0 to 1). Use numbers for numeric fields. Do not guess missing values; omit them. Confidence reflects the whole document readability.`}];
  content.push(isPdf?{type:"input_file",filename:file.originalname,file_data:dataUrl}:{type:"input_image",image_url:dataUrl});
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",input:[{role:"user",content}],text:{format:{type:"json_object"}}})});
  if(!response.ok)throw new Error("AI provider returned "+response.status);
  const payload=await response.json();const output=(payload.output||[]).flatMap(x=>x.content||[]).find(x=>x.type==="output_text")?.text;
  if(!output)throw new Error("No structured output");return JSON.parse(output);
}
app.patch("/api/shipments/:id/documents/:type",auth,(req,res)=>{
  const db=readDB(),s=db.shipments.find(x=>x.id===req.params.id);if(!s)return res.status(404).json({error:"Shipment not found."});
  const d=s.documents.find(x=>x.type===req.params.type);if(!d)return res.status(404).json({error:"Document slot not found."});
  const allowed=["description","quantity","unitPrice","currency","grossWeightKg","total","invoiceNumber","date","packages","consignee","shipper"];
  const next={};for(const k of allowed)if(req.body.fields&&Object.hasOwn(req.body.fields,k)&&req.body.fields[k]!==""&&req.body.fields[k]!==null)next[k]=["quantity","unitPrice","grossWeightKg","total","packages"].includes(k)?Number(req.body.fields[k]):String(req.body.fields[k]);
  const before=d.fields;d.fields={...d.fields,...next};d.confidence=d.name?Math.max(d.confidence||0,0.8):0;d.extractionStatus=d.name?"reviewed":"manual_entry";
  log(db,req.user,"fields_corrected",s.id,{type:d.type,before,after:d.fields});writeDB(db);res.json({...s,checks:checks(s)});
});
app.post("/api/shipments/:id/approve",auth,manager,(req,res)=>{
  const db=readDB(),s=db.shipments.find(x=>x.id===req.params.id);if(!s)return res.status(404).json({error:"Shipment not found."});
  const issues=checks(s);if(issues.length)return res.status(409).json({error:"Resolve all blocking checks before approval.",checks:issues});
  s.status="approved";s.approvedBy=req.user.email;s.approvedAt=new Date().toISOString();log(db,req.user,"shipment_approved",s.id);writeDB(db);res.json(s);
});
app.get("/api/shipments/:id/export",auth,(req,res)=>{
  const s=readDB().shipments.find(x=>x.id===req.params.id);if(!s)return res.status(404).json({error:"Shipment not found."});
  const issues=checks(s);if(issues.length||s.status!=="approved")return res.status(409).json({error:"Manager approval and zero unresolved checks are required before export.",checks:issues});
  const rows=[["shipmentId","supplier","origin","documentType","description","quantity","unitPrice","currency","grossWeightKg","total"],...s.documents.map(d=>[s.id,s.supplier,s.origin,d.type,d.fields.description||"",d.fields.quantity??"",d.fields.unitPrice??"",d.fields.currency||"",d.fields.grossWeightKg??"",d.fields.total??""])];
  const csv=rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\r\n");
  log(readDB(),req.user,"csv_exported",s.id);res.setHeader("Content-Type","text/csv");res.setHeader("Content-Disposition",`attachment; filename="${s.id}.csv"`);res.send(csv);
});
app.get("/api/audit",auth,manager,(req,res)=>res.json(readDB().audit));
app.get("/api/health",(req,res)=>res.json({ok:true,service:"CargoLens AI"}));
app.use((err,req,res,next)=>{console.error(err);res.status(400).json({error:err.message||"Request failed."});});
app.listen(PORT,()=>console.log(`CargoLens AI running at http://localhost:${PORT}`));
