// Vite's local TS loader reuses the application core. No listener, inference or network request.
import {createServer} from 'vite';
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
try {
  const {main}=await server.ssrLoadModule('/src/replay/cli.ts');
  await main(process.argv.slice(2));
} catch(error) {
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
} finally {await server.close();}
