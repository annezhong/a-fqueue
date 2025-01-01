# Usage
     import fqueue from "a-fqueue"
     
     let fq = new fqueue({
        accept:"jpg,png,gif", //format
        compress:false
     })
     
     fq.on("change",()=>{});
 

# Events

- change
- fileQueued
- error
- uploadStart
- uploadError
- uploadComplete
- uploadAccept
- uploadSuccess
- uploadComplete
- md5Progress
- md5Completed
