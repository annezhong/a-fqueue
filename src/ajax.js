	function setHeader(xhr, headers) {
	    for (var item in headers) {
	        xhr.setRequestHeader(item, headers[item]);
	    }
	}

	function ajax(options) {
	    var method = options.method || "post"; //默认post
	    var data = options.data || {};
	    var _url = options.url || "";
	    var success = options.success || function () {};
	    var _error = options.error || function () {};
	    var xhr = new XMLHttpRequest();
	    var header = options.header || {};

	    var formData = [];
	    var async = options.async;
	    if (typeof async =="undefined") {
	        async = true;
	    }
	    for (var item in data) {
	        formData.push(''.concat(item, '=', data[item]));
	    }
	    if (!_url) {
	        console.error("请求地址为空！");
	        return;
	    } else if (method.toLocaleLowerCase() == "get" && formData.length > 0) {
	        if (_url.indexOf("?") == -1) {
	            _url += "?";
	        } else {
	            _url += "&";
	        }
	        _url += formData.join("&");
	    }
	    if (async) {
	        xhr.responseType = options.dataType || "json";
	        xhr.onreadystatechange = function () {
	            if (xhr.readyState === 4) {
	                if ((xhr.status >= 200 && xhr.status < 300) || xhr.status == 304) {
	                    if (success && typeof success === 'function') {
	                        success(xhr.response);
	                    }
	                } else {
	                    if (_error && typeof _error === 'function') {
	                        _error();
	                    }
	                }
	            }
	        };
	    }
	    xhr.open(method, _url, async);
	    setHeader(xhr, header);
	    try {
	        if (method.toLowerCase() == "post") {
	            setHeader(xhr, {
	                "Content-Type": "application/x-www-form-urlencoded"
	            });
	            xhr.send(formData.join("&"));
	        } else {
	            xhr.send();
	        }
	    } catch (e) {

	    }
	    if (!async) {
	        var result = xhr.responseText;

	        if (result) {
	            var _result = JSON.parse(result);
	            if (_result.status) {
	                _error();
	            } else if (options.dataType == "json") {
	                success(_result);
	            } else {
	                success(result);
	            }
	        }
	    }
	}

	export default ajax;