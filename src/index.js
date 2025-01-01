import validator from "./validator";
import eImage from "./image"
import Transport from "./transport";
import pickerFile from "./pickerFile";
import utils from "./utils";
import Md5 from "./md5";
var fqueue_options = { //默认配置
    accept: "", //允许的文件后缀,多个,号分隔
    thumb: { //配置生成缩略图的选项
        width: 110,
        height: 110,
        // 图片质量，只有type为`image/jpeg`的时候才有效。
        quality: 70,
        // 是否允许放大，如果想要生成小图的时候不失真，此选项应该设置为false.
        allowMagnify: true,
        // 是否允许裁剪。
        crop: true,
        // 为空的话则保留原有图片格式。
        // 否则强制转换成指定的类型。
        type: 'image/jpeg'
    },
    compress: { //配置压缩的图片的选项。如果此选项为false, 则图片在上传前不进行压缩
        width: 1600,
        height: 1600,
        // 图片质量，只有type为`image/jpeg`的时候才有效。
        quality: 90,
        // 是否允许放大，如果想要生成小图的时候不失真，此选项应该设置为false.
        allowMagnify: false,
        // 是否允许裁剪。
        crop: false,
        // 是否保留头部meta信息。
        preserveHeaders: true,
        // 如果发现压缩后文件大小比原来还大，则使用原来图片
        // 此属性可能会影响图片自动纠正功能
        noCompressIfLarger: false,
        // 单位字节，如果图片大小小于此值，不会采用压缩。
        compressSize: 0
    },
    auto: false, //设置为 true 后，不需要手动调用上传，有文件选择即开始上传
    chunked: false, //是否要分片处理大文件上传
    chunkSize: 5242880, //如果要分片，分多大一片？ 默认大小为5M
    chunkedLower: 28 * 1024 * 1024,
    chunkRetry: 2, //如果某个分片由于网络问题出错，允许自动重传多少次？
    threads: 3, //上传并发数。 允许同时最大上传进程数。
    formData: {}, //文件上传请求的参数表，每次发送都会发送此对象中的参数    
    fileVal: "file", //设置文件上传域的name
    startNum: 0, //起始数量
    fileNumLimit: null, //验证文件总数量, 超出则不允许加入队列
    startSize: 0, //起始数量
    fileSizeLimit: null, //验证文件总大小是否超出限制, 超出则不允许加入队列。
    fileSingleSizeLimit: null, //验证单个文件大小是否超出限制, 超出则不允许加入队列。
    fileFormatSizeLimit: null, //按文件格式限制大小
    md5Method: "piec" //piec分块计算,all完整计算，按chunkedLower将文件切分成前中后在段分别计算md5后再合并计算md5
};
import mimi from "./mimi"
import queue from "./queue"
import ffile from "./file"
const Status = utils.Status;
var success_ids = [];
export default class fqueue extends validator {
    constructor(options) {
        super();
        this.options = Object.assign({}, fqueue_options, options || {}); //配置
        this.queue = new queue();
        this.state = this.queue.state;
        this.runing = false;
        this.progress = false;
        this.pool = []; // 记录当前正在传的数据，跟threads相关
        this.stack = []; //缓存分好片的文件。
        this.pending = []; // 缓存即将上传的文件。
        this.remaning = 0; //跟踪还有多少分片在上传中但是没有完成上传。
        this.addValidator(); //注册验证事件
        this.init();
    }
    init() {
        var me = this;
        var opts = me.options;
        this.on("startUpload", function () {
            me.progress = true;
        })
        this.on("uploadFinished", function () {
            me.progress = false;
            // console.log("all", success_ids);
        })
        this.on("uploadComplete", function (file) {
            //debugger;
            // 把其他块取消了。
            file.blocks && file.blocks.forEach(function (v) {
                v.transport && (v.transport.abort(), v.transport.destroy());
                delete v.transport;
            });
            success_ids.push(file.id);
            // console.log("uploadComplete", success_ids.join(", "));
            delete file.blocks;
            delete file.remaning;
        });
        //分片上传前计算md5
        this.syncOn("beforeSend", function (block) {
            return new Promise((r, j) => {
                me.md5File(block.blob).then(function (md5) {
                    block.chunkMd5 = md5.toLowerCase();
                    r();
                }).catch(function () {
                    j();
                })
            });
        });
        //文件上传前计算md5
        this.syncOn("beforeSendFile", function (file) {
            return new Promise((r, j) => {
                if (opts.md5Method == "piec" && opts.chunked && opts.chunkedLower <= file.size) { //分片计算
                    var center = parseInt(file.size / 2);
                    var blobs = [];
                    var index = 0;
                    var time = 0;
                    var md5 = "";
                    var md5s = [];
                    var percent = 0;
                    var _percent = 0;
                    var chunkMd5 = opts.chunkMd5;
                    blobs.push(file.source.slice(0, chunkMd5));
                    blobs.push(file.source.slice(center - parseInt(chunkMd5 / 2), center + parseInt(chunkMd5 / 2)));
                    blobs.push(file.source.slice(file.size - chunkMd5, file.size));

                    function getMd5(source) {
                        me.md5File(source).progress(function (percentage) {
                            if (percentage != 1) {
                                percent = _percent + percentage;
                            } else if (percent > 2) {
                                percent = 3;
                            }
                            file.percent = (percent / 3).toFixed(2);
                            me.trigger("md5Progress", file, (percent / 3).toFixed(2));
                        }).then(function (filemd5) {
                            md5s.push(filemd5);
                            _percent++;
                            percent = _percent;
                            index++;
                            if (index == blobs.length) { //将分算后的MD5合并，再次MD5计算
                                md5 = md5s.join("");
                                var _md5 = md5.toLocaleUpperCase();
                                md5 = Md5.md5(_md5).toLowerCase();
                                file.md5 = md5;
                                //md5计算完成，此事件可做md5校验，是否需要跳过
                                me.syncTrigger("beforeMd5Complete", function (result) {
                                    var args = [];
                                    if (arguments.length > 1) {
                                        for (var i = 1; i < arguments.length; i++)
                                            args.push(arguments[i]);
                                    }
                                    if (result) {
                                        me.trigger("md5Complete", file);
                                        r();
                                    } else {
                                        me.trigger("uploadError", file, ...args);
                                        j();
                                    }
                                }, file);
                            } else {
                                getMd5(blobs[index]);
                            }
                        }).catch(function (ex) {
                            console.error(ex);
                            me.trigger("uploadError", file, "md5");
                            j();
                        })
                    }
                    getMd5(blobs[index]);

                } else { //完整计算
                    me.md5File(file.source).progress(function (percentage) {
                        file.percent = percentage.toFixed(2);
                        me.trigger("md5Progress", file, percentage.toFixed(2));
                    }).then(function (filemd5) {
                        file.md5 = filemd5.toLowerCase();
                        //md5计算完成，此事件可做md5校验，是否需要跳过
                        me.syncTrigger("beforeMd5Complete", function (result) {
                            var args = [];
                            if (arguments.length > 1) {
                                for (var i = 1; i < arguments.length; i++)
                                    args.push(arguments[i]);
                            }
                            if (result) {
                                me.trigger("md5Complete", file);
                                r();
                            } else {
                                me.trigger("uploadError", file, ...args);
                                j();
                            }
                        }, file);

                    });
                }
            });

        });
    }
    _createDom() {
        var $obj = document.createElement("input");
        var that = this;
        $obj.setAttribute("type", "file");
        $obj.setAttribute("accept", mimi(this.options.accept));
        if (this.options.fileNumLimit !== 1) { //限制数量不为1，可多选
            $obj.setAttribute("multiple", "multiple");
        }
        $obj.addEventListener("change", function (e) {
            var files = e.target.files;
            if (files.length === 0) {
                return;
            }
            that.trigger("change");
            var _files = [];
            for (var i = 0; i < files.length; i++) {
                _files.push(new pickerFile(utils.guid("rt_"), files[i]))
            }
            that.addFiles(_files);
        });
        this.$dom = $obj;
    }
    open() {
        if (!this.$dom) {
            this._createDom();
        }
        this.$dom.click();
    }
    /**
     * 跳过上传
     * @param {*} file 
     */
    skipFile(file) {}
    /**
     * 添加文件到队列
     * @param {*} files 多文件
     */
    addFiles(files) {
        if (!files || !files.length) return;
        var me = this;
        var n = 0;
        for (var i = 0; i < files.length; i++) {
            me.addFile(files[i], function () {
                n++;
                if (n == files.length && me.options.auto) { //自动上传
                    me.upload();
                }
            });
        }
    }
    /**
     * 添加单文件到队列
     * @param {*} file 
     */
    addFile(file, fn) {
        var _file = new ffile(file);
        if (!this.trigger("beforeFileQueued", _file)) { //检测不通过
            return;
        }
        var me = this;
        //检测图片宽、高限制
        this.imageLimitSize(_file, function (ok) {
            if (ok) { //验证通过
                me.compress(_file, function (state, __file) {
                    console.log("compress")
                    if (state) { //压缩完成新文件加入队列
                        me.queue.append(__file);
                        me.trigger("fileQueued", __file);
                    }
                    if (fn) {
                        fn();
                    }
                })
            }
        });
    }
    compress(file, fn) { //压缩图片
        var me = this;
        var opts = this.options.compress || this.options.resize,
            compressSize = opts && opts.compressSize || 0,
            noCompressIfLarger = opts && opts.noCompressIfLarger || false,
            image;
        // gif 可能会丢失针
        if (!opts || !/^image/.test(file.type) || file.type == "image/gif" ||
            file._compressed) {
            fn(true, file);
            return;
        }
        opts = Object.assign({}, opts);

        image = new eImage(opts);
        image.once('error', function () { //失败用原文件
            fn(true, file);
        });
        image.once('load', function () {
            var width = opts.width,
                height = opts.height;

            file._info = file._info || image.info();
            file._meta = file._meta || image.meta();

            // 如果 width 的值介于 0 - 1
            // 说明设置的是百分比。
            if (width <= 1 && width > 0) {
                width = file._info.width * width;
            } else if (!width && height) {
                width = height * file._info.width / file._info.height;
            }

            // 同样的规则应用于 height
            if (height && height <= 1 && height > 0) {
                height = file._info.height * height;
            } else if (!height && width) {
                height = width * file._info.height / file._info.width;
            }

            image.resize(width, height);
        });

        image.once('complete', function () {
            var blob, size;

            try {
                blob = image.getAsBlob(image.type);

                size = file.size;
                // 如果压缩后，比原来还大则不用压缩后的。
                if (!noCompressIfLarger || blob.size < size) {

                    // file.source.destroy && file.source.destroy();
                    file.source = new pickerFile(bold);
                    file.size = blob.size;

                    file.trigger('resize', blob.size, size);
                }

                // 标记，避免重复压缩。
                file._compressed = true;

            } catch (e) {
                debugger;
            }
            fn(true, file);
        });
        file._info && image.info(file._info);
        file._meta && image.meta(file._meta);

        image.loadFromBlob(file.source.source);
    }
    //上传
    upload(file) {
        var me = this;
        // 移出invalid的文件
        var files = this.queue.getFiles(Status.INVALID);
        files.forEach(function (n) {
            me.removeFile(n);
        })
        //指定文件上传
        if (file) {
            var _file = this.queue.getFile(file.id ? file.id : file);
            if (_file) {
                var status = _file.getStatus();
                if (status === Status.INTERRUPT) { //上传中断，可续传
                    me.pool.forEach(function (v) {
                        if (v.file !== file) {
                            return;
                        }
                        v.transport && v.transport.send(); //重新开始上传
                    });
                    _file.setStatus(Status.QUEUED);
                } else if (status === Status.PROGRESS) { //正在上传
                    return;
                } else {
                    file.setStatus(Status.QUEUED);
                }
            }
        } else {
            //将所有初始状态的文件更改为排队状态
            this.queue.getFiles(Status.INITED).forEach(function (n) {
                n.setStatus(Status.QUEUED);
            });
        }
        if (me.runing) { //队列已开始上传，安心等待上传
            return;
        }
        me.runing = true;
        var _files = [];
        me.pool.forEach(function (v) {
            var file = v.file;
            if (file.getStatus() === Status.INTERRUPT) {
                _files.push(file);
                me._trigged = false;
                v.transport && v.transport.send();
            }
        });
        var file;
        while ((file = _files.shift())) {
            file.setStatus(Status.PROGRESS);
        }
        me._trigged = false;
        me.trigger('startUpload');
        me._tick();
    }
    _tick() {
        var me = this,
            opts = me.options;
        if (me.pool.length < opts.threads) {
            me._nextBlock(function (val) {
                if (val) {
                    me._trigged = false;
                    me._startSend(val); //开始上传
                    me._tick(); //多文件并发
                } else if (!me.remaning && !me.queue.stats.numOfQueue && !me.queue.stats.numOfInterrupt && !me.queue.stats.numOfProgress) {
                    me.runing = false;
                    me._trigged = true;
                    me.trigger("uploadFinished"); //所有文件已上传完成
                    me.$dom = null;
                }
            });
        } else if (!me.remaning && !me.queue.stats.numOfQueue && !me.queue.stats.numOfInterrupt && !me.queue.stats.numOfProgress) {
            me.runing = false;
            me._trigged = true;
            me.trigger("uploadFinished"); //所有文件已上传完成
            me.$dom = null;
        }
    }
    // 开始上传，可以被跳过。如果promise被reject了，则表示跳过此分片。
    _startSend(block) {
        var me = this,
            file = block.file;
        if (file.getStatus() !== Status.PROGRESS) {

            // 如果是中断，则还需要放回去。
            if (file.getStatus() === Status.INTERRUPT) {
                me._putback(block);
            }

            return;
        }
        me.pool.push(block);
        me.remaning++;
        // 如果没有分片，则直接使用原始的。
        // 不会丢失content-type信息。
        block.blob = block.chunks === 1 ? file.source :
            file.source.slice(block.start, block.end);
        me.syncTrigger("beforeSend", function (result) {
            if (result) {
                if (file.getStatus() === Status.PROGRESS) {
                    me._doSend(block);
                } else {
                    me._popBlock(block);
                    me._tick();
                }
            } else {
                if (file.remaning === 1) {
                    me._finishFile(file).then(function () {
                        block.percentage = 1;
                        me._popBlock(block);
                        me.trigger('uploadComplete', file);
                        me._tick();
                    });
                } else {
                    block.percentage = 1;
                    me.updateFileProgress(file);
                    me._popBlock(block);
                    me._tick();
                }
            }
        }, block)
    }
    // 做上传操作。
    _doSend(block) {
        var me = this,
            opts = me.options,
            file = block.file,
            data = Object.assign({}, opts.formData || {}),
            headers = Object.assign({}, opts.headers),
            requestAccept, ret;
        var type = file.type;
        if (type.length > 200) {
            type = type.substr(0, 200);
        }
        data = Object.assign(data, {
            filemd5: file.md5,
            totalSize: file.size,
            type: type,
            formate: file.ext,
            name: file.name
        });
        if (block.chunks > 1) {
            Object.assign(data, {
                chunks: block.chunks,
                chunk: block.chunk,
                currentChunkSize: block.end - block.start,
                chunkmd5: block.chunkMd5,
                chunkSize: opts.chunkSize
            })
        }
        var _opts = Object.assign({}, opts);
        me.trigger("uploadBeforeSend", block, data, headers, file, _opts);
        // console.log("_doSend",JSON.stringify(data));
        var tr = new Transport(_opts);
        block.transport = tr;
        // 用来询问，是否返回的结果是有错误的。
        requestAccept = function (reject) {
            var fn;

            ret = tr.getResponseAsJson() || {};
            ret._raw = tr.getResponse();
            fn = function (value) {
                reject = value;
            };

            // 服务端响应了，不代表成功了，询问是否响应正确。
            if (!me.trigger('uploadAccept', block, ret, fn)) {
                reject = reject || 'server';
            }

            return reject;
        };
        tr.on("destroy", function () {
            delete block.transport;
            me._popBlock(block);
            setTimeout(function () {
                me._tick();
            })
        });
        tr.on("progress", function (percentage) {
            // console.log("Transport-progress", percentage);
            block.percentage = percentage;
            me.updateFileProgress(file);
        });
        tr.on("error", function (type, flag) {
            // console.log("Transport-error", type, flag);
            block.retried = block.retried || 0;
            // 自动重试
            if (block.chunks > 1 && ~'http,abort'.indexOf(type) &&
                block.retried < opts.chunkRetry) {
                block.retried++;
                tr.send();
            } else {
                if (!flag && type === 'server') {
                    type = requestAccept(type);
                }
                file.setStatus(Status.ERROR, type);
                me.trigger('uploadError', file, type);
                me.trigger('uploadComplete', file);
            }
        });
        // 上传成功
        tr.on('load', function () {
            var reason;
            // 如果非预期，转向上传出错。
            if ((reason = requestAccept())) {
                tr.trigger('uploadError', file, ret);
                return;
            }
            // 全部上传完成。
            if (file.remaning === 1) {
                me._finishFile(file, ret);
            } else {
                tr.destroy();
            }
        });
        // 开始发送。
        tr.appendBlob(opts.fileVal, block.blob, file.name);
        tr.append(data);
        tr.setRequestHeader(headers);
        tr.send();
    }
    _nextBlock(fn) {
        var me = this,
            opts = me.options,
            act, next, done, preparing;

        function done(file) {
            if (!file) {
                return null;
            }
            act = file.cuteFile(opts.chunked && opts.chunkedLower <= file.size ? opts.chunkSize : 0);
            me.stack.push(act);
            return act.shift();
        }
        if ((act = this._getStack())) {
            // 是否提前准备下一个文件
            if (opts.prepareNextFile && !me.pending.length) {
                me._prepareNextFile(function () {
                    fn(done(me.pending.shift()))
                });
            } else {
                fn(act.shift());
            }
        } else if (me.runing) {
            if (!me.pending.length && me.queue.stats.numOfQueue) { //pending无数据但队列中还有排队的文件
                me._prepareNextFile(function () {
                    fn(done(me.pending.shift()))
                });
            } else {
                // console.log("_nextBlock", this.pending.length);
                fn(done(me.pending.shift()))
            }
        }
    }
    _getStack() {
        var i = 0,
            act;
        var me = this;
        while ((act = me.stack[i++])) {
            if (act.has() && act.file.getStatus() === Status.PROGRESS) {
                return act;
            } else if (!act.has() ||
                act.file.getStatus() !== Status.PROGRESS &&
                act.file.getStatus() !== Status.INTERRUPT && act.file.getStatus() !== Status.MD5) {

                // 把已经处理完了的，或者，状态为非 progress（上传中）、
                // interupt（暂停中） 的移除。
                me.stack.splice(--i, 1);
            }
        }

        return null;
    }
    //重置
    reset() {
        this.runing = false;
        this.pool = [];
        this.stack = [];
        this.pending = [];
        this.remaning = 0;
        this.trigger("reset");
        if (this.$dom) {
            this.$dom.value = "";
        }
    }
    //移除某一文件, 默认只会标记文件状态为已取消，如果第二个参数为 `true` 则会从 queue 中移除。
    //file可以是file对象，也可以是文件id
    removeFile(file, remove) {
        var me = this;
        file = file.id ? file : me.queue.getFile(file);
        this.cancleFile(file);
        if (remove && file) {
            this.queue.removeFile(file); //从队列中移除
            this.trigger("fileDequeued");
        }
    }
    //取消上传
    cancleFile(file) {
        try {
            file = file && file.id ? file : this.queue.getFile(file);
            if (file) {
                // 如果正在上传。
                file.blocks && file.blocks.forEach(function (v) {
                    var _tr = v.transport;
                    if (_tr) {
                        _tr.abort();
                        _tr.destroy();
                        delete v.transport;
                    }
                });
                if (file.setStatus)
                    file.setStatus(Status.CANCELLED);
            }
        } catch (ex) {
            console.log(ex.message);
        }
    }
    //准备上传 ，某个文件开始上传前触发，一个文件只会触发一次。
    _prepareNextFile(fn) {
        var me = this;
        // if (me.pool.length < me.threads) {
        var file = me.queue.fetch(Status.QUEUED); //从队列表取出一个排队状态的文件
        if (file) {
            // console.log("start", file.id);
            me.trigger("uploadStart", file); //单个文件开始上传
            file.setStatus(Status.MD5);
            me.syncTrigger("beforeSendFile", function (result, reason) {
                if (!result) { //出错
                    file.setStatus(Status.ERROR);
                    me.trigger("uploadError", file, reason);
                    me._finishFile(file); //文件完成上传               
                } else { //准备就绪,推入缓存
                    file.setStatus(Status.PROGRESS);
                    me.pending.push(file);
                    fn();
                }
            }, file);
        }
        // } else {
        //     fn();
        // }
    }
    _finishFile(file, ret, hds) {
        var me = this;
        var args = arguments;
        return new Promise(r => {
            me.syncTrigger("afterSendFile", function (result, reason) {
                if (result) {
                    file.setStatus(Status.COMPLETE);
                    me.trigger("uploadSuccess", file, ret, hds);
                    me.trigger('uploadComplete', file);
                } else {
                    if (file.getStatus() === Status.PROGRESS) {
                        file.setStatus(Status.ERROR, reason);
                    }
                    me.trigger("uploadError", file, reason);
                    me.trigger('uploadComplete', file);
                }
                r();
            }, ...args)
        })

    }
    updateFileProgress(file) {
        var totalPercent = 0,
            uploaded = 0;
        if (!file.blocks) {
            return;
        }
        file.blocks.forEach(function (v) {
            uploaded += (v.percentage || 0) * (v.end - v.start);
        })
        totalPercent = uploaded / file.size;
        file.percent = totalPercent;
        this.trigger('uploadProgress', file, totalPercent || 0);
    } // 让出位置了，可以让其他分片开始上传
    _popBlock(block) {
        var idx = this.pool.indexOf(function (n) {
            return n == block
        });
        this.pool.splice(idx, 1);
        block.file.remaning--;
        this.remaning--;
    }
    md5File(file, start, end) {
        var me = this;
        var notify;
        var promise = new Promise((r, j) => {
            var md5 = new Md5({
                    owner: me
                }),
                blob = (file instanceof Blob) ? file :
                me.queue.getFile(file).source;

            md5.on('progress load', function (e) {
                e = e || {};
                if (notify)
                    notify(e.total ? e.loaded / e.total : 1);
            });

            md5.on('complete', function () {
                r(md5.getResult())
            });

            md5.on('error', function (reason) {
                j(reason);
            });

            if (arguments.length > 1) {
                start = start || 0;
                end = end || 0;
                start < 0 && (start = blob.size + start);
                end < 0 && (end = blob.size + end);
                end = Math.min(end, blob.size);
                blob = blob.slice(start, end);
            }

            md5.loadFromBlob(blob);
        })
        promise.progress = function (handler) {
            notify = handler;
            return promise;
        }
        return promise;

    }
};