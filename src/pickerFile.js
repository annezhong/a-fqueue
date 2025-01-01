import base from "./base"
import utils from "./utils"
var uid = 1,
    rExt = /\.([^.]+)$/;;

export default class pickerFile extends base {
    constructor(ruid, file) {
        super();
        this.name = file.name || ('untitled' + uid++);
        var ext = rExt.exec(file.name) ? RegExp.$1.toLowerCase() : '';
        this.ext = ext;
        this.lastModifiedDate = file.lastModifiedDate || (new Date()).toLocaleString();
        this.source = file;
        this.size=file.size;
        this.ruid = ruid;
        if (!file.type && this.ext &&
            ~'jpg,jpeg,png,gif,bmp'.indexOf(this.ext)) {
            this.type = 'image/' + (this.ext === 'jpg' ? 'jpeg' : this.ext);
        } else {
            this.type = file.type || 'application/octet-stream';
        }
        this.uid = file.uid || utils.guid("rt_");

    }
    slice(start, end) {
        var blob = this.source;
        var slice = blob.slice || blob.webkitSlice || blob.mozSlice;
        blob = slice.call(blob, start, end);
        return new pickerFile(utils.guid("rt_"), blob);
    }
    getSource() {
        return this.source;
    }
}