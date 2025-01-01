import base from "./base"
import file from "./file"
import utils from "./utils";
const STATUS = utils.Status;
export default class Queue extends base {
    constructor() {
        super();
        /**
         * 统计文件数。
         * * `numOfQueue` 队列中的文件数。
         * * `numOfSuccess` 上传成功的文件数
         * * `numOfCancel` 被取消的文件数
         * * `numOfProgress` 正在上传中的文件数
         * * `numOfUploadFailed` 上传错误的文件数。
         * * `numOfInvalid` 无效的文件数。
         * * `numOfDeleted` 被移除的文件数。
         * * `numOfInterrupt` 被中断的文件数。
         * @property {Object} stats
         */
        this.stats = {
            numOfQueue: 0,
            numOfSuccess: 0,
            numOfCancel: 0,
            numOfProgress: 0,
            numOfUploadFailed: 0,
            numOfInvalid: 0,
            numOfDeleted: 0,
            numOfInterrupt: 0
        };

        // 上传队列，仅包括等待上传的文件
        this._queue = [];

        // 存储所有文件
        this._map = {};
    }
    /**
     * 将新文件加入对队列尾部
     */
    append(file) {
        this._queue.push(file);
        this._fileAdded(file);
        return this;
    };
    /**
     * 将新文件加入对队列头部
     *
     * @method prepend
     * @param  {File} file   文件对象
     */
    prepend(file) {
        this._queue.unshift(file);
        this._fileAdded(file);
        return this;
    };
    /**
     * 获取文件对象
     *
     * @method getFile
     * @param  {String} fileId   文件ID
     * @return {File}
     */
    getFile(fileId) {
        if (typeof fileId !== 'string') {
            return fileId;
        }
        return this._map[fileId];
    };
    /**
     * 从队列中取出一个指定状态的文件。
     * @grammar fetch( status ) => File
     * @method fetch
     * @param {String} status [文件状态值](#WebUploader:File:File.Status)
     * @return {File} [File](#WebUploader:File)
     */
    fetch(status) {
        var len = this._queue.length,
            i, file;

        status = status || STATUS.QUEUED;

        for (i = 0; i < len; i++) {
            file = this._queue[i];

            if (status === file.getStatus()) {
                return file;
            }
        }

        return null;
    };
    /**
     * 对队列进行排序，能够控制文件上传顺序。
     * @grammar sort( fn ) => undefined
     * @method sort
     * @param {Function} fn 排序方法
     */
    sort(fn) {
        if (typeof fn === 'function') {
            this._queue.sort(fn);
        }
    };
    /**
     * 获取指定类型的文件列表, 列表中每一个成员为[File](#WebUploader:File)对象。
     * @grammar getFiles( [status1[, status2 ...]] ) => Array
     * @method getFiles
     * @param {String} [status] [文件状态值](#WebUploader:File:File.Status)
     */
    getFiles() {
        var sts = [].slice.call(arguments, 0),
            ret = [],
            i = 0,
            len = this._queue.length,
            file;
        for (; i < len; i++) {
            file = this._queue[i];

            if (sts.length && sts.indexOf(file.getStatus()) == -1) {
                continue;
            }

            ret.push(file);
        }

        return ret;
    }

    /**
     * 在队列中删除文件。
     * @grammar removeFile( file ) => Array
     * @method removeFile
     * @param {File} 文件对象。
     */
    removeFile(file) {
        var me = this,
            existing = me._map[file.id];

        if (existing) {
            delete me._map[file.id];
            me._delFile(file);
            if (file.destroy)
                file.destroy();
            me.stats.numOfDeleted++;

        }
    }
    _fileAdded(file) {
        var me = this,
            existing = this._map[file.id];

        if (!existing) {
            this._map[file.id] = file;

            file.on('statuschange', function (cur, pre) {
                me._onFileStatusChange(cur, pre);
            });
        }
    }

    _delFile(file) {
        for (var i = this._queue.length - 1; i >= 0; i--) {
            if (this._queue[i] == file) {
                this._queue.splice(i, 1);
                break;
            }
        }
    }

    _onFileStatusChange(curStatus, preStatus) {
        var stats = this.stats;

        switch (preStatus) {
            case STATUS.PROGRESS:
                stats.numOfProgress--;
                break;

            case STATUS.QUEUED:
                stats.numOfQueue--;
                break;

            case STATUS.ERROR:
                stats.numOfUploadFailed--;
                break;

            case STATUS.INVALID:
                stats.numOfInvalid--;
                break;

            case STATUS.INTERRUPT:
                stats.numOfInterrupt--;
                break;
        }

        switch (curStatus) {
            case STATUS.QUEUED:
                stats.numOfQueue++;
                break;

            case STATUS.PROGRESS:
                stats.numOfProgress++;
                break;

            case STATUS.ERROR:
                stats.numOfUploadFailed++;
                break;

            case STATUS.COMPLETE:
                stats.numOfSuccess++;
                break;

            case STATUS.CANCELLED:
                stats.numOfCancel++;
                break;


            case STATUS.INVALID:
                stats.numOfInvalid++;
                break;

            case STATUS.INTERRUPT:
                stats.numOfInterrupt++;
                break;
        }
    }
}