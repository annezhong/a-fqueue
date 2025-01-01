export default class base {
    constructor() {
        this._events = {};
        this._async_events = {};
    }
    //添加事件
    on(name, fn) {
        var me = this;
        var names = name.split(" ");
        names.forEach(function (n) {
            if (!me._events[n]) {
                me._events[n] = [];
            }
            me._events[n].push(fn);
        })

    }
    syncOn(name, fn) {
        if (!this._async_events[name]) {
            this._async_events[name] = [];
        }
        this._async_events[name].push(fn);
    }
    //执行事件
    trigger(name, ...args) {
        var result = false;
        var events = this._events[name];
        if (events && events.length) {
            for (var i = 0; i < events.length; i++) {
                if (events[i].call(this, ...args) === false) {
                    result = true;
                    break;
                }
            }
        }
        return !result;
    }
    syncTrigger(name, fn, ...args) {
        var events = this._async_events[name];
        var count = 0;
        var me = this;

        function next() {
            if (count >= events.length) { //所有执行完成
                fn.call(me, true, ...arguments);
            } else {
                events[count](...args).then(function () {
                    count++;
                    next(...arguments);
                }).catch(function () {
                    fn.call(me, false, ...arguments);
                })
            }
        }
        if (events && events.length) {
            next();
        } else {
            fn.call(me, true, ...args);
        }
    }
    once(name, fn) {
        var me = this;
        var once = function () {
            me.off(name, once);
            return fn.apply(me, arguments);
        }
        me.on(name, once);
    }
    off(name, fn) {
        var events = this._events[name];
        if (events && events.length) {
            var i = events.findIndex(function (e) {
                return e == fn;
            })
            if (i != -1) {
                events.splice(i, 1);
            }
        }
    }
    formatSize(size, pointLength, units) {
        var unit;
        units = units || ['B', 'K', 'M', 'G', 'TB'];
        while ((unit = units.shift()) && size > 1024) {
            size = size / 1024;
        }
        return (unit === 'B' ? size : size.toFixed(pointLength || 2)) +
            unit;
    }
}