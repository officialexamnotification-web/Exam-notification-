import * as cp from "child_process";
const child = cp.spawn("node", ["dist/server.cjs"], { stdio: "pipe", env: { ...process.env, NODE_ENV: "production" } });
child.stdout.on("data", d => process.stdout.write(d));
child.stderr.on("data", d => process.stderr.write(d));
setTimeout(() => {
  child.kill();
  console.log("Process exited");
}, 2000);
