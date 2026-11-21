'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const root=__dirname,output=path.join(root,'app');
const files=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(root,'bundle.b64'),'utf8').trim(),'base64')).toString('utf8'));
for(const [relative,contents] of Object.entries(files)){
  if(relative.startsWith('/')||relative.split('/').includes('..'))throw Error('Unsafe archive path');
  const dest=path.join(output,relative);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,Buffer.from(contents,'base64'));
}
console.log('NovaShop backend sources unpacked:',Object.keys(files).length);
