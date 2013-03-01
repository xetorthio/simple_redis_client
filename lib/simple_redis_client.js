var hiredis = require("hiredis"),
    net = require("net"),
    events = require("events"),
    fbuffers = require("flexbuffer");
    

function SimpleRedisClient(port,host,options){
    var self = this
    this.localBuffer = new fbuffers.FlexBuffer()
    this.host = host;
    this.port = port;
    this.options = options;
    this.reader =  new hiredis.Reader({ "return_buffers": options.return_buffers });
    this.client = net.createConnection(this.port,this.host)
    this.execQueue = []
    this.ready = false;
    this.connected = false
    this.recheckTime = 1000 || options.recheckTime
    this.rechecking = false
    this.checkingConnectTimeout = false
    this.startConnectTimeoutChecker()
    this.finished = false

    this.client.on("connect",function(){
        self.connected = true
        this.setTimeout(0)
        this.setNoDelay(true)
        this.setKeepAlive(true)
        self.execQueue=[]
        if(!self.ready){
            self.ready = true;
            self.emit("ready");
        }
        process.nextTick(function(){
            self.emit("connect");
        })
    })

    this.client.on("error",function(err){
       if(!self.rechecking && (self.connected || !self.ready)){
           self.connected = false
           self.recheckProcess()
       }
       process.nextTick(function(){
         //Flush the exec queue
         for (var i in self.execQueue)
             self.execQueue.shift()(new Error("INTERNAL ERROR"),undefined)
       })
       self.emit("error", err)
    })

    this.client.on("close",function(err){
      self.goneConnection("CLOSE",err)
    })


    this.client.on("end",function(err){
      self.goneConnection("END",err)
    })

    this.client.on("timeout",function(err){
      self.goneConnection("TIMEOUT",err)
    })


    this.on("reply",function(data){
        var callback = self.execQueue.shift()
        try{
            if(data && data instanceof Error){
                callback(data, undefined)
            }else{
                callback(undefined, data)
            }
        }catch(e){
            process.nextTick(function(){
            })
        }
    })

    this.client.on("data", function(data) {
        var reply;
        self.reader.feed(data);
        var dataTime = false
        try{
            dataTime = process.hrtime(self.execQueue[0].time)[1] / 1000000
        }catch(e){}
        
        try {
            var emits = 0
            while((reply = self.reader.get()) !== undefined){
                self.emit("reply", reply);
                emits++
            }
        } catch(err) {
            self.reader = null;
            self.client.emit("error", err);
            self.client.destroy();
        }
    });
}


SimpleRedisClient.prototype = new events.EventEmitter();

SimpleRedisClient.prototype.goneConnection = function(why,err) {
     if(!this.finished)
       this.emit("error","Connection closed unexpectedly")
}


SimpleRedisClient.prototype.recheckProcess = function(){
    var self = this
    var check = function(){
        if(self.finished)
            return
        if(!self.connected){
            self.rechecking = true
            try{
                self.client.connect(self.port,self.host)
                this.startConnectTimeoutChecker()
            }catch(e){}
            setTimeout(check,self.recheckTime)
        }else{
            self.rechecking = false
        }
    }
    check() 
}

SimpleRedisClient.prototype.execute = function(){
    this.localBuffer.rewind()
    var args = arguments
    if(args.length < 2)
        throw new Error("Invalid arguments, at least must be command and callback")
    var callback = args[args.length - 1] 

    if(!this.connected)
        callback(new Error("Redis client is not connected"))

    this.execQueue.push(callback)
    
    this.localBuffer.write("*")
    this.localBuffer.write((args.length - 1).toString())
    this.localBuffer.write("\r\n")
    for (var i = 0; i < args.length - 1 ; i++) {
        var arg = args[i];
        if(typeof(arg) == "number")
            arg = arg.toString()
        if(arg == undefined)
            arg = "undefined"
        var arglength = typeof arg == "string" ? Buffer.byteLength(arg) : arg.length
        this.localBuffer.write("$")
        this.localBuffer.write(arglength.toString())
        this.localBuffer.write("\r\n")
        this.localBuffer.write(arg)
        this.localBuffer.write("\r\n")
    }
    this.client.write(this.localBuffer.getBuffer())
    callback.time = process.hrtime()
}

SimpleRedisClient.prototype.startConnectTimeoutChecker = function(){
    var self = this
    var checker = function(){
        if(self.finished)
            return
        self.checkingConnectTimeout = false
        if(!self.connected){
            self.client.emit("error","Connect timeout reached ["+self.options.connectTimeout+"]")
        }
    }
    if(!this.checkingConnectTimeout && (this.options.connectTimeout && this.options.connectTimeout>0)){
        this.checkingConnectTimeout = true
        setTimeout(checker,this.options.connectTimeout)
    }
}

SimpleRedisClient.prototype.quit = function(){
    this.finished = true
    this.connected = false
    this.client.end()
    this.client.destroy()
}

module.exports.SimpleRedisClient = SimpleRedisClient
module.exports.createClient = function(port,host,options){
    if(options == undefined)
        options = {}
    if(options.return_buffers == undefined)
        options.return_buffers = true
    return new SimpleRedisClient(port,host,options)
}
