# Usage
 import fqueue from "a-fqueue"

 let fq = new fqueue({
    accept:"jpg,png,gif", //format
    compress:false
 })

 fq.on("change",()=>{});
 
