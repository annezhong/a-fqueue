import base from "./base"
import file from "./file"
import utils from "./utils";
const STATUS = utils.Status;
var FILETER_LIMIT = ["exe", "php", "asp", "aspx", "js", "xml", "css", "dll", "com", "bat", "iso", "int", "sys", "adt", "java", "map", "bin", "cab"];
//空格,单引号,逗号,连字号,小数点,下划线,数字，大小字字母，《，》，？，，；，……，中文
var FILE_NAME = /[^\x20\x27\x2c\x2d\x2e\x5f0-9a-zA-Z\u300a\u300b\uff1f\uff0c\uff1b\u2026\u4e00-\u9fa5]/g;
export default class validator extends base {
    constructor() {
        super();
    }
    addValidator() {
        this.fileNumLimit();
        this.fileSizeLimit();
        this.fileSingleSizeLimit();
        this.acceptFile();
        this.fileFormatSizeLimit();
        this.filterFilename();
        this.filterFormat();
        this.duplicate();
    }
    acceptFile() {
        var me = this;
        var opts = me.options;
        this.on("beforeFileQueued", function (file) {
            // console.log("acceptFile");
            // debugger;
            var regex = new RegExp(opts.accept.replace(/,/g, "|"));
            var invalid = !file || opts.accept && file.ext && !regex.test(file.ext.toLocaleLowerCase());
            if (invalid) {
                me.trigger("error", "Q_TYPE_DENIED", file); //触发错误监听
                return false;
            }
            return true;
        });
    }
    /**
     * 图片大小限制检测
     */
    imageLimitSize(file, fn) {
        var me = this;
        var opts = me.options;
        if (/^image/.test(file.type)) { //图片

            var reader = new FileReader();
            reader.onload = function (r) {
                file.base64 = r.target.result;
                var img = document.createElement("img");
                img.onload = function () {
                    file.resolution = img.width + "x" + img.height; //图片大小
                    if (opts.limitHeight || opts.limitWidth) {
                        if (opts.limitWidth && img.width > opts.limitWidth) {
                            opts.trigger("error", "F_LIMIT_WIDTH", file);
                            fn(false);
                        } else if (opts.limitHeight && img.width > opts.limitHeight) {
                            opts.trigger("error", "F_LIMIT_HEIGHT", file);
                            fn(false);
                        } else {
                            fn(true);
                        }
                    } else {
                        fn(true);
                    }
                };
                img.src = r.target.result;
            };
            reader.readAsDataURL(file.source.source);


        } else {
            fn(true);
        }
    }
    /**
     * 验证文件总数量, 超出则不允许加入队列
     */
    fileNumLimit() {
        var opts = this.options;
        var max = parseInt(opts.fileNumLimit, 10); //默认限制数量0
        var count = this.options.startNum;
        var me = this;
        var flag = true;
        if (!max) {
            return;
        }
        this.on("beforeFileQueued", function (file) {
            // debugger;
            // console.log("fileNumLimit");
            if (count >= max && flag) {
                flag = false;
                me.trigger("error", "Q_EXCEED_NUM_LIMIT", max, file); //触发错误监听
                setTimeout(function () {
                    flag = true;
                })
            }
            return count >= max ? false : true; //超过返回false，阻止加入队列
        });
        this.on("fileQueued", function () {
            count++; //成功添加至队列总数加1
        });
        this.on("fileDequeued", function () {
            count--; //移除队列总数减1
            if (count < 0) {
                count = 0;
            }
        });
        this.on("reset", function () {
            count = 0; //重置上传总数规0
        });
    }
    /**
     * 验证文件总大小是否超出限制, 超出则不允许加入队列
     */
    fileSizeLimit() {
        var opts = this.options;
        var max = parseInt(opts.fileSizeLimit, 10);
        var count = this.startSize; //总容量
        var me = this;
        var flag = true;
        if (!max) {
            return;
        }
        this.on("beforeFileQueued", function (file) {
            // debugger;
            // console.log("fileSizeLimit");
            var invalid = count + file.size > max;
            if (invalid && flag) {
                flag = false;
                me.trigger('error', 'Q_EXCEED_SIZE_LIMIT', max, file);
                setTimeout(function () {
                    flag = true;
                }, 1);
            }

            return invalid ? false : true;
        });
        this.on('fileQueued', function (file) {
            count += file.size;
        });

        this.on('fileDequeued', function (file) {
            count -= file.size;
            if (count < 0) {
                count = 0;
            }
        });

        this.on('reset', function () {
            count = 0;
        });
    }
    /**
     * 验证单个文件大小是否超出限制, 超出则不允许加入队列。
     */
    fileSingleSizeLimit() {
        var opts = this.options;
        var me = this;
        var max = opts.fileSingleSizeLimit;
        if (!max) {
            return;
        }

        this.on('beforeFileQueued', function (file) {
            // debugger;
            // console.log("fileSingleSizeLimit");
            if (file.size > max) {
                file.setStatus(STATUS.INVALID, 'exceed_size');
                me.trigger('error', 'F_EXCEED_SIZE', max, file);
                return false;
            }
            return true;
        });
    }
    /**
     * 根据文件格式分别验证文件大小
     */
    fileFormatSizeLimit() {
        var opts = this.options;
        var me = this;
        var limit = opts.fileFormatSizeLimit;
        if (!limit) {
            return;
        }
        this.on("beforeFileQueued", function (file) {
            // debugger;
            // console.log("fileFormatSizeLimit");
            var ext = file.ext.toLocaleLowerCase();
            if (limit[ext] && file.size > limit[ext]) {
                file.setStatus(STATUS.INVALID, 'exceed_size');
                me.trigger('error', 'F_EXCEED_SIZE', limit[ext], file);
                return false;
            }
            return true;
        });
    }
    /**
     * 文件名过滤
     */
    filterFilename() {
        var me = this;
        this.on("beforeFileQueued", function (file) {
            // debugger;
            // console.log("filterFilename");
            var name = file.name;
            var reg = FILE_NAME;
            var match = name.match(reg);
            //检测到文件名中包含不允许的字符
            if (match && match.length > 0) {
                me.trigger('error', 'F_NAME_FILTER', match, file);
                return false;
            }
            return true;
        });
    }
    /**
     * 排除指定后辍文件格式
     */
    filterFormat() {
        var me = this;
        var opts = this.options;
        var filter = opts.filterFormat;
        this.on("beforeFileQueued", function (file) {
            // debugger
            // console.log("filterFormat");
            var ext = file.ext.toLocaleLowerCase();
            var reg = new RegExp("(^|,)" + ext + "($|,)");
            if (filter && reg.test(filter)) {
                me.trigger('error', 'F_FORMAT_FILTER', ext, file);
                return false;
            } else if (FILETER_LIMIT.some(function (e) { //强制过滤格式
                    return ext == e
                })) {
                me.trigger('error', 'F_FORMAT_FILTER', ext, file);
                return false;
            }
            return true;
        });
    }
    /**
     * 去重， 根据文件名字、 文件大小和最后修改时间来生成hash Key.
     */
    duplicate() {
        var uploader = this,
            opts = uploader.options,
            mapping = {};

        if (opts.duplicate) {
            return;
        }

        function hashString(str) {
            var hash = 0,
                i = 0,
                len = str.length,
                _char;

            for (; i < len; i++) {
                _char = str.charCodeAt(i);
                hash = _char + (hash << 6) + (hash << 16) - hash;
            }

            return hash;
        }

        uploader.on('beforeFileQueued', function (file) {
            // debugger;
            // console.log("duplicate");
            var hash = file.__hash || (file.__hash = hashString(file.name +
                file.size + file.lastModifiedDate));

            // 已经重复了
            if (mapping[hash]) {
                uploader.trigger('error', 'F_DUPLICATE', file);
                return false;
            }
            return true;
        });

        uploader.on('fileQueued', function (file) {
            var hash = file.__hash;

            hash && (mapping[hash] = true);
        });

        uploader.on('fileDequeued', function (file) {
            var hash = file.__hash;

            hash && (delete mapping[hash]);
        });

        uploader.on('reset', function () {
            mapping = {};
        });
        uploader.on("uploadFinished", function () { //所有文件全部传完清理map准备下次上传
            // debugger;
            mapping = {};
        })
    }
}