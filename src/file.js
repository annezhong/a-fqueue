import base from "./base"
import utils from "./utils";
var statusMap = {};

export default class FFile extends base {
    constructor(f) {
        super();
        this.source = f;
        this.id = "FFile_" + parseInt(Math.random() * 1e6);
        this.ext = f.name.match(/\.([^.]+$)/)[1];
        this.fileName = f.name.substr(0, f.name.length - this.ext.length - 1);
        this.sizeDW = this.formatSize(f.size);
        this.status = utils.Status.INITED;
        this.filePath = URL.createObjectURL(f.source);
        this.name = f.name;
        this.lastModifiedDate = f.lastModifiedDate;
        this.type = f.type;
        this.size = f.size;
        this.percent = 0;//上传或md5进度
        this.statusText = "";
        statusMap[this.id] = this.status;
    }
    setStatus(status, text) {
        var prevStatus = statusMap[this.id];
        if (typeof text != "undefined") {
            this.statusText = text;
        }
        if (status != prevStatus) {
            statusMap[this.id] = status;
            if(this.status!=status){
                this.percent=0;
            }
            this.status=status;
            this.trigger("statuschange", status, prevStatus); //触发状态改变事件，该事件在文件append到队列时注册
        }
    }
    getStatus() {
        return statusMap[this.id];
    }
    slice() {

    }
    getSource() {
        return this.source;
    }
    //将文件切片
    cuteFile(chunkSize) {
        var me = this;
        var pending = [],
            blob = this.source,
            total = blob.size,
            chunks = chunkSize ? Math.ceil(total / chunkSize) : 1,
            start = 0,
            index = 0,
            len, api;

        api = {
            file: me,

            has: function () {
                return !!pending.length;
            },

            shift: function () {
                return pending.shift();
            },

            unshift: function (block) {
                pending.unshift(block);
            }
        };
        while (index < chunks) {
            len = Math.min(chunkSize, total - start);

            pending.push({
                file: me,
                start: start,
                end: chunkSize ? (start + len) : total,
                total: total,
                chunks: chunks,
                chunk: index++,
                cuted: api
            });
            start += len;
        }

        me.blocks = pending.concat();
        me.remaning = pending.length;
        return api;
    }
};