import base from "./base"
import utils from "./utils";
var ImageOptions = {
    // 默认的图片处理质量
    quality: 90,

    // 是否裁剪
    crop: false,

    // 是否保留头部信息
    preserveHeaders: false,

    // 是否允许放大。
    allowMagnify: false
};
export default class EImage extends base {
    constructor(opts) {
        super();
        this.options = Object.assign({}, ImageOptions, opts || {});
        this.init();
    }
    init() {
        var me = this;
        var img = new Image();
        img.onload = function () {
            me._info = {
                type: me.type,
                width: this.width,
                height: this.height
            }
            me.trigger("load");
        };
        img.onerror = function () {
            me.trigger("error");
        };
        me._img = img;
    }
    info(val) {
        if (val) {
            this._info = val;
            return this;
        }
        return this._info;
    }
    meta(val) {
        if (val) {
            this._metas = val;
            return this;
        }
        return this._metas;
    }
    destroy() {
        var canvas = this._canvas;
        this._img.onload = null;
        if (canvas) {
            canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
            canvas.width = canvas.height = 0;
            this._canvas = null;
        }
        this._img.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs%3D";
        this._img = this._blob = null;
    }
    loadFromBlob(blob) {
        var me = this;
        var img = this._img;
        me._blob = blob;
        me.type = blob.type;
        img.src = URL.createObjectURL(blob);
        this.once("load", function () {
            URL.revokeObjectURL(img.src);
        })
    }
    getAsBlob(type) {
        var blob = this._blob,
            opts = this.options,
            canvas;

        type = type || this.type;
        debugger;
        // blob需要重新生成。
        if (this.modified || this.type !== type) {
            canvas = this._canvas;
            if (type === 'image/jpeg') {
                blob = canvas.toDataURL(type, opts.quality / 100);
                if (opts.preserveHeaders && this._metas &&
                    this._metas.imageHead) {

                    blob = utils.dataURL2ArrayBuffer(blob);
                    blob = utils.updateImageHead(blob,
                        this._metas.imageHead);
                    blob = utils.arrayBufferToBlob(blob, type);
                    return blob;
                }
            } else {
                blob = canvas.toDataURL(type);
            }

            blob = utils.dataURL2Blob(blob);
        }

        return blob;
    }
    resize(width, height) {
        var canvas = this._canvas || (this._canvas = document.createElement("canvas"));
        this._resize(this._img, canvas, width, height);
        this._blob = null;
        this.modified = true;
        this.trigger("complete", "resize");
    }
    getOrientation() {
        return this._metas && this._metas.exif &&
            this._metas.exif.get('Orientation') || 1;
    }
    _resize(img, cvs, width, height) {
        var opts = this.options,
            naturalWidth = img.width,
            naturalHeight = img.height,
            orientation = this.getOrientation(),
            scale, w, h, x, y;

        // values that require 90 degree rotation
        if (~[5, 6, 7, 8].indexOf(orientation)) {

            // 交换width, height的值。
            width ^= height;
            height ^= width;
            width ^= height;
        }

        scale = Math[opts.crop ? 'max' : 'min'](width / naturalWidth,
            height / naturalHeight);

        // 不允许放大。
        opts.allowMagnify || (scale = Math.min(1, scale));

        w = naturalWidth * scale;
        h = naturalHeight * scale;

        if (opts.crop) {
            cvs.width = width;
            cvs.height = height;
        } else {
            cvs.width = w;
            cvs.height = h;
        }

        x = (cvs.width - w) / 2;
        y = (cvs.height - h) / 2;

        opts.preserveHeaders || this._rotate2Orientaion(cvs, orientation);

        this._renderImageToCanvas(cvs, img, x, y, w, h);
    }
    _renderImageToCanvas(canvas) {
        var args = utils.slice(arguments, 1),
            ctx = canvas.getContext('2d');
        ctx.drawImage(...args);
    }
}