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
    //We'll maintains this parameter to know if we should call a callback function
    //or emit a message event
    this.isSubscribed = false

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
        var dataToReturn = undefined 
        var errorToReturn = undefined
        if(data && data instanceof Error){
            errorToReturn = data
        }else{
            dataToReturn = data
        }

        /*
         * Pub / Sub checks
         */
        if(self.isSubscribed && dataToReturn != undefined){
            if(dataToReturn[0].toString() == "message")
                self.emit("message",dataToReturn[1],dataToReturn[2],dataToReturn)
            else if(dataToReturn[0].toString() == "pmessage")
                self.emit("pmessage",dataToReturn[1],dataToReturn[2],dataToReturn[3],dataToReturn)
        }
        /*
         * Callbacks calls
         */
        try{
            var callback = self.execQueue.shift()
            if(callback)
                callback(errorToReturn,dataToReturn)
        }catch(e){
            process.nextTick(function(){
            })
        }
    })

    this.client.on("data", function(data) {
        var reply;
        self.reader.feed(data);
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
    if(arguments.length < 2)
        throw new Error("Invalid arguments, at least must be command and callback")
    
    var argsNum = arguments.length - 1
    var callback = arguments[argsNum] 


    if(!this.connected)
        callback(new Error("Redis client is not connected"))

    var realCallback

    var command = arguments[0].toUpperCase()
    var self = this
   
    /*
     * We'll check if we're subscribing and we'll wrap the function to
     * start or stop the message emitting 
     */
    if(command == "SUBSCRIBE" || command == "PSUBSCRIBE" 
            || command == "UNSUBSCRIBE" || command == "PUNSUBSCRIBE"){
        realCallback= function(err,data){
            if(!err)
                self.isSubscribed = (data[2] != 0)
            callback(err,data)
        }
    }else{
        realCallback = callback
    }

    this.execQueue.push(realCallback)
   
    var thereBuffers = false 
    var strCommands="*"+argsNum+"\r\n"  
    
    for (var i = 0; i < argsNum ; i++) {
        var arg = arguments[i];
       
        if(typeof(arg) == "number")
            arg = arg.toString()
       
        if(arg == undefined)
            arg = "undefined"
        
        if(arg instanceof Buffer){
            strCommands+="$"+(arg.length)+"\r\n"
            if(!thereBuffers)
                this.localBuffer.rewind()
            thereBuffers = true
            this.localBuffer.write(strCommands)
            this.localBuffer.write(arg)
            strCommands="\r\n"

        }else{
            strCommands+="$"+Buffer.byteLength(arg)+"\r\n"+arg+"\r\n"
        }
    }
    if(thereBuffers){
        this.localBuffer.write(strCommands)
        this.client.write(this.localBuffer.getBuffer())
    }else{
        this.client.write(strCommands)
    }
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
