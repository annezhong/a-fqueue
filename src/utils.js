export default {
    Status: {
        INITED: 'inited', // 初始状态
        QUEUED: 'queued', // 已经进入队列, 等待上传
        MD5: 'md5', //md5计算中
        PROGRESS: 'progress', // 上传中
        ERROR: 'error', // 上传出错，可重试
        COMPLETE: 'complete', // 上传完成。
        CANCELLED: 'cancelled', // 上传取消。
        INTERRUPT: 'interrupt', // 上传中断，可续传。
        INVALID: 'invalid' // 文件不合格，不能重试上传。
    },
    dataURL2ArrayBuffer: function (dataURI) {
        var byteStr, intArray, i, parts;

        parts = dataURI.split(',');

        if (~parts[0].indexOf('base64')) {
            byteStr = atob(parts[1]);
        } else {
            byteStr = decodeURIComponent(parts[1]);
        }

        intArray = new Uint8Array(byteStr.length);

        for (i = 0; i < byteStr.length; i++) {
            intArray[i] = byteStr.charCodeAt(i);
        }

        return intArray.buffer;
    },
    _parse: function (buffer, noParse) {
        if (buffer.byteLength < 6) {
            return;
        }

        var dataview = new DataView(buffer),
            offset = 2,
            maxOffset = dataview.byteLength - 4,
            headLength = offset,
            ret = {},
            markerBytes, markerLength, parsers, i;

        if (dataview.getUint16(0) === 0xffd8) {

            while (offset < maxOffset) {
                markerBytes = dataview.getUint16(offset);

                if (markerBytes >= 0xffe0 && markerBytes <= 0xffef ||
                    markerBytes === 0xfffe) {

                    markerLength = dataview.getUint16(offset + 2) + 2;

                    if (offset + markerLength > dataview.byteLength) {
                        break;
                    }

                    parsers = api.parsers[markerBytes];

                    if (!noParse && parsers) {
                        for (i = 0; i < parsers.length; i += 1) {
                            parsers[i].call(api, dataview, offset,
                                markerLength, ret);
                        }
                    }

                    offset += markerLength;
                    headLength = offset;
                } else {
                    break;
                }
            }

            if (headLength > 6) {
                if (buffer.slice) {
                    ret.imageHead = buffer.slice(2, headLength);
                } else {
                    // Workaround for IE10, which does not yet
                    // support ArrayBuffer.slice:
                    ret.imageHead = new Uint8Array(buffer)
                        .subarray(2, headLength);
                }
            }
        }

        return ret;
    },
    guid: function (prefix) {
        var counter = 0;

        var guid = (+new Date()).toString(32),
            i = 0;

        for (; i < 5; i++) {
            guid += Math.floor(Math.random() * 65535).toString(32);
        }

        return (prefix || 'wu_') + guid + (counter++).toString(32);

    },
    _parse: function (buffer, noParse) {
        if (buffer.byteLength < 6) {
            return;
        }

        var dataview = new DataView(buffer),
            offset = 2,
            maxOffset = dataview.byteLength - 4,
            headLength = offset,
            ret = {},
            markerBytes, markerLength, parsers, i;

        if (dataview.getUint16(0) === 0xffd8) {

            while (offset < maxOffset) {
                markerBytes = dataview.getUint16(offset);

                if (markerBytes >= 0xffe0 && markerBytes <= 0xffef ||
                    markerBytes === 0xfffe) {

                    markerLength = dataview.getUint16(offset + 2) + 2;

                    if (offset + markerLength > dataview.byteLength) {
                        break;
                    }

                    parsers = api.parsers[markerBytes];

                    if (!noParse && parsers) {
                        for (i = 0; i < parsers.length; i += 1) {
                            parsers[i].call(api, dataview, offset,
                                markerLength, ret);
                        }
                    }

                    offset += markerLength;
                    headLength = offset;
                } else {
                    break;
                }
            }

            if (headLength > 6) {
                if (buffer.slice) {
                    ret.imageHead = buffer.slice(2, headLength);
                } else {
                    // Workaround for IE10, which does not yet
                    // support ArrayBuffer.slice:
                    ret.imageHead = new Uint8Array(buffer)
                        .subarray(2, headLength);
                }
            }
        }

        return ret;
    },
    updateImageHead: function (buffer, head) {
        var data = this._parse(buffer, true),
            buf1, buf2, bodyoffset;


        bodyoffset = 2;
        if (data.imageHead) {
            bodyoffset = 2 + data.imageHead.byteLength;
        }

        if (buffer.slice) {
            buf2 = buffer.slice(bodyoffset);
        } else {
            buf2 = new Uint8Array(buffer).subarray(bodyoffset);
        }

        buf1 = new Uint8Array(head.byteLength + 2 + buf2.byteLength);

        buf1[0] = 0xFF;
        buf1[1] = 0xD8;
        buf1.set(new Uint8Array(head), 2);
        buf1.set(new Uint8Array(buf2), head.byteLength + 2);

        return buf1.buffer;
    },
    arrayBufferToBlob: function (buffer, type) {
        var builder = window.BlobBuilder || window.WebKitBlobBuilder,
            bb;

        // android不支持直接new Blob, 只能借助blobbuilder.
        if (builder) {
            bb = new builder();
            bb.append(buffer);
            return bb.getBlob(type);
        }

        return new Blob([buffer], type ? {
            type: type
        } : {});
    },
    dataURL2Blob: function (dataURI) {
        var byteStr, intArray, ab, i, mimetype, parts;

        parts = dataURI.split(',');

        if (~parts[0].indexOf('base64')) {
            byteStr = atob(parts[1]);
        } else {
            byteStr = decodeURIComponent(parts[1]);
        }

        ab = new ArrayBuffer(byteStr.length);
        intArray = new Uint8Array(ab);

        for (i = 0; i < byteStr.length; i++) {
            intArray[i] = byteStr.charCodeAt(i);
        }

        mimetype = parts[0].split(':')[1].split(';')[0];

        return this.arrayBufferToBlob(ab, mimetype);
    },
    slice: function (args, start, end) {
        var _args = [];
        var max = args.length;
        if (typeof end != "undefined") {
            end = max;
        }
        for (var i = start; i < max; i++) {
            _args.push(args[i]);
        }
        return _args;
    },
    param: function (data) {
        var strs = [];
        for (var item in data) {
            if (typeof data[item] == "object") {
                strs.push(item + "=" + JSON.stringify(data[item]))
            } else if (typeof data[item] != "undefined") {
                strs.push(item + "=" + data[item]);
            } else {
                strs.push(item + "=");
            }
        }
        return strs.join("&");
    }

}