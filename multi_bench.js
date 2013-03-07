var redis = require("./index"),
    metrics = require("metrics"),
    num_clients = parseInt(process.argv[2], 10) || 5,
    num_requests = 20000,
    tests = [],
    versions_logged = false,
    client_options = {
        return_buffers: false
    },
    small_str, large_str, small_buf, large_buf;

redis.debug_mode = false;

function lpad(input, len, chr) {
    var str = input.toString();
    chr = chr || " ";

    while (str.length < len) {
        str = chr + str;
    }
    return str;
}

metrics.Histogram.prototype.print_line = function () {
    var obj = this.printObj();
    
    return lpad(obj.min, 4) + "/" + lpad(obj.max, 4) + "/" + lpad(obj.mean.toFixed(2), 7) + "/" + lpad(obj.p95.toFixed(2), 7);
};

function Test(args) {
    this.args = args;
    
    this.callback = null;
    this.clients = [];
    this.clients_ready = 0;
    this.commands_sent = 0;
    this.commands_completed = 0;
    this.max_pipeline = this.args.pipeline || num_requests;
    this.client_options = args.client_options || client_options;
    
    this.connect_latency = new metrics.Histogram();
    this.ready_latency = new metrics.Histogram();
    this.command_latency = new metrics.Histogram();
}

Test.prototype.run = function (callback) {
    var i;

    this.callback = callback;

    for (i = 0; i < num_clients ; i++) {
        this.new_client(i);
    }
};

Test.prototype.new_client = function (id) {
    var self = this, new_client;
    
    new_client = redis.createClient(6379, "127.0.0.1", this.client_options);
    new_client.create_time = Date.now();

    new_client.on("connect", function () {
        self.connect_latency.update(Date.now() - new_client.create_time);
    });

    new_client.on("ready", function () {
        if (! versions_logged) {
            console.log("Client count: " + num_clients + ", node version: " + process.versions.node + ", parser: hiredis") 
            versions_logged = true;
        }
        self.ready_latency.update(Date.now() - new_client.create_time);
        self.clients_ready++;
        if (self.clients_ready === self.clients.length) {
            self.on_clients_ready();
        }
    });

    self.clients[id] = new_client;
};

Test.prototype.on_clients_ready = function () {
    process.stdout.write(lpad(this.args.descr, 13) + ", " + lpad(this.args.pipeline, 5) + "/" + this.clients_ready + " ");
    this.test_start = Date.now();

    this.fill_pipeline();
};

Test.prototype.fill_pipeline = function () {
    var pipeline = this.commands_sent - this.commands_completed;

    while (this.commands_sent < num_requests && pipeline < this.max_pipeline) {
        this.commands_sent++;
        pipeline++;
        this.send_next();
    }
    
    if (this.commands_completed === num_requests) {
        this.print_stats();
        this.stop_clients();
    }
};

Test.prototype.stop_clients = function () {
    var self = this;
    
    this.clients.forEach(function (client, pos) {
        if (pos === self.clients.length - 1) {
            client.quit(function (err, res) {
                            });
        } else {
            client.quit();
        }
    });
    self.callback();

};

Test.prototype.send_next = function () {
    var self = this,
        cur_client = this.commands_sent % this.clients.length,
        start = Date.now();

    var func = function (err, res) {
        if (err) {
            throw err;
        }
        self.commands_completed++;
        self.command_latency.update(Date.now() - start);
        self.fill_pipeline();
    }
    if(!this.loaded){
        this.args.args.push(func)
        this.loaded=true
    }
    this.clients[cur_client].execute.apply(this.clients[cur_client],this.args.args);
};

Test.prototype.print_stats = function () {
    var duration = Date.now() - this.test_start;
    
    console.log("min/max/avg/p95: " + this.command_latency.print_line() + " " + lpad(duration, 6) + "ms total, " +
        lpad((num_requests / (duration / 1000)).toFixed(2), 8) + " ops/sec");
};

small_str = "1234";
small_buf = new Buffer(small_str);
large_str = (new Array(4097).join("-"));
large_buf = new Buffer(large_str);

tests.push(new Test({descr: "PING", args: ["ping"], pipeline: 1}));
tests.push(new Test({descr: "PING", args: ["ping"], pipeline: 50}));
tests.push(new Test({descr: "PING", args: ["ping"], pipeline: 200}));
tests.push(new Test({descr: "PING", args: ["ping"], pipeline: 20000}));

tests.push(new Test({descr: "SET small str", args: ["set", "foo_rand000000000000", small_str], pipeline: 1}));
tests.push(new Test({descr: "SET small str", args: ["set", "foo_rand000000000000", small_str], pipeline: 50}));
tests.push(new Test({descr: "SET small str", args: ["set", "foo_rand000000000000", small_str], pipeline: 200}));
tests.push(new Test({descr: "SET small str", args: ["set", "foo_rand000000000000", small_str], pipeline: 20000}));

tests.push(new Test({descr: "SET small buf", args: ["set", "foo_rand000000000000", small_buf], pipeline: 1}));
tests.push(new Test({descr: "SET small buf", args: ["set", "foo_rand000000000000", small_buf], pipeline: 50}));
tests.push(new Test({descr: "SET small buf", args: ["set", "foo_rand000000000000", small_buf], pipeline: 200}));
tests.push(new Test({descr: "SET small buf", args: ["set", "foo_rand000000000000", small_buf], pipeline: 20000}));

tests.push(new Test({descr: "GET small str", args: ["get", "foo_rand000000000000"], pipeline: 1}));
tests.push(new Test({descr: "GET small str", args: ["get", "foo_rand000000000000"], pipeline: 50}));
tests.push(new Test({descr: "GET small str", args: ["get", "foo_rand000000000000"], pipeline: 200}));
tests.push(new Test({descr: "GET small str", args: ["get", "foo_rand000000000000"], pipeline: 20000}));

tests.push(new Test({descr: "GET small buf", args: ["get", "foo_rand000000000000"], pipeline: 1, client_opts: { return_buffers: true} }));
tests.push(new Test({descr: "GET small buf", args: ["get", "foo_rand000000000000"], pipeline: 50, client_opts: { return_buffers: true} }));
tests.push(new Test({descr: "GET small buf", args: ["get", "foo_rand000000000000"], pipeline: 200, client_opts: { return_buffers: true} }));
tests.push(new Test({descr: "GET small buf", args: ["get", "foo_rand000000000000"], pipeline: 20000, client_opts: { return_buffers: true} }));

tests.push(new Test({descr: "SET large str", args: ["set", "foo_rand000000000001", large_str], pipeline: 1}));
tests.push(new Test({descr: "SET large str", args: ["set", "foo_rand000000000001", large_str], pipeline: 50}));
tests.push(new Test({descr: "SET large str", args: ["set", "foo_rand000000000001", large_str], pipeline: 200}));
tests.push(new Test({descr: "SET large str", args: ["set", "foo_rand000000000001", large_str], pipeline: 20000}));

tests.push(new Test({descr: "SET large buf", args: ["set", "foo_rand000000000001", large_buf], pipeline: 1}));
tests.push(new Test({descr: "SET large buf", args: ["set", "foo_rand000000000001", large_buf], pipeline: 50}));
tests.push(new Test({descr: "SET large buf", args: ["set", "foo_rand000000000001", large_buf], pipeline: 200}));
tests.push(new Test({descr: "SET large buf", args: ["set", "foo_rand000000000001", large_buf], pipeline: 20000}));

tests.push(new Test({descr: "GET large str", args: ["get", "foo_rand000000000001"], pipeline: 1}));
tests.push(new Test({descr: "GET large str", args: ["get", "foo_rand000000000001"], pipeline: 50}));
tests.push(new Test({descr: "GET large str", args: ["get", "foo_rand000000000001"], pipeline: 200}));
tests.push(new Test({descr: "GET large str", args: ["get", "foo_rand000000000001"], pipeline: 20000}));

tests.push(new Test({descr: "GET large buf", args: ["get", "foo_rand000000000001"], pipeline: 1, client_opts: { return_buffers: true} }));
tests.push(new Test({descr: "GET large buf", args: ["get", "foo_rand000000000001"], pipeline: 50, client_opts: { return_buffers: true} }));
tests.push(new Test({descr: "GET large buf", args: ["get", "foo_rand000000000001"], pipeline: 200, client_opts: { return_buffers: true} }));
tests.push(new Test({descr: "GET large buf", args: ["get", "foo_rand000000000001"], pipeline: 20000, client_opts: { return_buffers: true} }));

tests.push(new Test({descr: "INCR", args: ["incr", "counter_rand000000000000"], pipeline: 1}));
tests.push(new Test({descr: "INCR", args: ["incr", "counter_rand000000000000"], pipeline: 50}));
tests.push(new Test({descr: "INCR", args: ["incr", "counter_rand000000000000"], pipeline: 200}));
tests.push(new Test({descr: "INCR", args: ["incr", "counter_rand000000000000"], pipeline: 20000}));

tests.push(new Test({descr: "LPUSH", args: ["lpush", "mylist", small_str], pipeline: 1}));
tests.push(new Test({descr: "LPUSH", args: ["lpush", "mylist", small_str], pipeline: 50}));
tests.push(new Test({descr: "LPUSH", args: ["lpush", "mylist", small_str], pipeline: 200}));
tests.push(new Test({descr: "LPUSH", args: ["lpush", "mylist", small_str], pipeline: 20000}));

tests.push(new Test({descr: "LRANGE 10", args: ["lrange", "mylist", "0", "9"], pipeline: 1}));
tests.push(new Test({descr: "LRANGE 10", args: ["lrange", "mylist", "0", "9"], pipeline: 50}));
tests.push(new Test({descr: "LRANGE 10", args: ["lrange", "mylist", "0", "9"], pipeline: 200}));
tests.push(new Test({descr: "LRANGE 10", args: ["lrange", "mylist", "0", "9"], pipeline: 20000}));

tests.push(new Test({descr: "LRANGE 100", args: ["lrange", "mylist", "0", "99"], pipeline: 1}));
tests.push(new Test({descr: "LRANGE 100", args: ["lrange", "mylist", "0", "99"], pipeline: 50}));
tests.push(new Test({descr: "LRANGE 100", args: ["lrange", "mylist", "0", "99"], pipeline: 200}));
tests.push(new Test({descr: "LRANGE 100", args: ["lrange", "mylist", "0", "99"], pipeline: 20000}));

function next() {
    var test = tests.shift();
    if (test) {
        test.run(function () {
            next();
        });
    } else {
        console.log("End of tests.");
        process.exit(0);
    }
}

next();
