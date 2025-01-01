import base from "./base"
import utils from "./utils";
var TransportOptions = {
    server: '',
    method: 'POST',

    // 跨域时，是否允许携带cookie, 只有html5 runtime才有效
    withCredentials: false,
    fileVal: 'file',
    timeout: 2 * 60 * 1000, // 2分钟
    formData: {},
    headers: {},
    sendAsBinary: false
};
var noop = function () {};
export default class Transport extends base {
    constructor(opts) {
        super();
        this._status = 0;
        this._response = null;
        this.options = Object.assign({}, TransportOptions, opts || {});
        this._blob = null;
        this._formData = opts.formData || {};
        this._headers = opts.headers || {};
        this._timer = null;
        this.on("progress", this._timeout);
        var me = this;
        this.on("load error", function () {
            me.trigger("progress", 1);
            clearTimeout(me._timer);
        })
    }
    appendBlob(key, blob, filename) {
        var me = this,
            opts = me.options;

        me._blob = blob;
        opts.fileVal = key || opts.fileVal;
        opts.filename = filename || opts.filename;
    }
    append(key, value) {
        if (typeof key === "object") {
            Object.assign(this._formData, key);
        } else {
            this._formData[key] = value;
        }
    }
    setRequestHeader(key, value) {
        if (typeof key === 'object') {
            Object.assign(this._headers, key);
        } else {
            this._headers[key] = value;
        }
    }
    _timeout() {
        var me = this,
            duration = me.options.timeout;

        if (!duration) {
            return;
        }

        clearTimeout(me._timer);
        me._timer = setTimeout(function () {
            me.abort();
            me.trigger('error', 'timeout');
        }, duration);
    }
    send() {
        var owner = this,
            opts = this.options,
            xhr = this._initAjax(),
            blob = owner._blob,
            server = opts.server,
            formData, binary, fr;
        if (opts.sendAsBinary) {
            server += opts.attachInfoToQuery !== false ? ((/\?/.test(server) ? '&' : '?') +
                utils.param(owner._formData)) : '';

            binary = blob.getSource();
        } else {
            formData = new FormData();
            for (var item in owner._formData) {
                formData.append(item, owner._formData[item]);
            }
            if (typeof blob != "undefined" && blob) {
                formData.append(opts.fileVal, blob.getSource(),
                    opts.filename || owner._formData.name || '');
            }
        }

        if (opts.withCredentials && 'withCredentials' in xhr) {
            xhr.open(opts.method, server, true);
            xhr.withCredentials = true;
        } else {
            xhr.open(opts.method, server);
        }
        this._setRequestHeader(xhr, opts.headers);
        xhr.overrideMimeType &&
            xhr.overrideMimeType('application/octet-stream');
        if (binary) {
            // 强制设置成 content-type 为文件流。

            xhr.send(binary);
        } else {
            xhr.send(formData);
        }
    }
    _initAjax() {
        var me = this,
            xhr = new XMLHttpRequest(),
            opts = this.options;

        if (opts.withCredentials && !('withCredentials' in xhr) &&
            typeof XDomainRequest !== 'undefined') {
            xhr = new XDomainRequest();
        }

        xhr.upload.onprogress = function (e) {
            var percentage = 0;

            if (e.lengthComputable) {
                percentage = e.loaded / e.total;
            }

            return me.trigger('progress', percentage);
        };

        xhr.onreadystatechange = function () {

            if (xhr.readyState !== 4) {
                return;
            }

            xhr.upload.onprogress = noop;
            xhr.onreadystatechange = noop;
            me._xhr = null;
            me._status = xhr.status;
            if (xhr.status >= 200 && xhr.status < 300) {
                me._response = xhr.responseText;
                me._headers = me._parseHeader(xhr.getAllResponseHeaders());
                return me.trigger('load');
            } else if (xhr.status >= 500 && xhr.status < 600) {
                me._response = xhr.responseText;
                me._headers = me._parseHeader(xhr.getAllResponseHeaders());
                return me.trigger('error', 'server-' + xhr.status);
            }

            return me.trigger('error', me._status ? 'http-' + xhr.status : 'abort');
        };

        me._xhr = xhr;
        return xhr;
    }
    getResponse() {
        return this._response;
    }

    getResponseAsJson() {
        return this._parseJson(this._response);
    }

    getResponseHeaders() {
        return this._headers;
    }

    getStatus() {
        return this._status;
    }

    abort() {
        var xhr = this._xhr;

        if (xhr) {
            xhr.upload.onprogress = noop;
            xhr.onreadystatechange = noop;
            xhr.abort();

            this._xhr = xhr = null;
        }
    }

    destroy() {
        this.trigger('destroy');
        this.off();
        this.abort();
    }

    _parseHeader(raw) {
        var ret = {};

        raw && raw.replace(/^([^\:]+):(.*)$/mg, function (_, key, value) {
            ret[key.trim()] = value.trim();
        });

        return ret;
    }
    _setRequestHeader(xhr, headers) {
        for (var item in headers) {
            xhr.setRequestHeader(item, headers[item]);
        }
    }
    _parseJson(str) {
        var json;

        try {
            json = JSON.parse(str);
        } catch (ex) {
            json = {};
        }

        return json;
    }
}