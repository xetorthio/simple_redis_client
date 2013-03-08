var should = require("should")
    redisClient = require("../lib/simple_redis_client.js")

describe("Redis Client Test",function(){
    var redisConf = {
        "host":"127.0.0.1",
        "port":6379
    }

    it("should get an error if can't connect to redis",function(done){
        var client = redisClient.createClient(9999,"127.0.0.1")
        client.on("error",function(err){
            should.exist(err)
            client.quit()
            done()
        })
    })
    it("should emit connect on client connected",function(done){
        var client = redisClient.createClient(redisConf.port,redisConf.host)
        client.on("connect",function(){
            client.quit()
            done()
        })
    })
    it("should emit ready on client connected",function(done){
        var client = redisClient.createClient(redisConf.port,redisConf.host)
        client.on("ready",function(){
            client.quit()
            done()
        })
    })
    describe("Basic Ops",function(){
        var client
        beforeEach(function(done){
            client = redisClient.createClient(redisConf.port,redisConf.host)
            client.on("error",function(err){
                done(err)
            })
            client.on("ready",function(){
                client.execute("FLUSHALL",function(err){
                    should.not.exist(err) 
                    done()
                })
            })
        })
        afterEach(function(done){
            if(client)
                client.quit()
            process.nextTick(function(){
                done()
            })
        })

        it("It should enable set and get",function(done){
           client.execute("get",1,function(err,data){
               should.not.exist(err)
                should.not.exist(data)
                client.execute("set","test","hello",function(err){
                   should.not.exist(err)
                    client.execute("get","test",function(err,data){
                        should.not.exist(err)
                        should.exist(data)
                        data.toString().should.equal("hello")
                        done()
                     })
                })
           })
        })
        it("It should run ok with errors",function(done){
            client.execute("ERROR OP",10,function(err,data){
                should.exist(err)
                should.not.exist(data)
                client.execute("set","test","hello",function(err){
                   should.not.exist(err)
                    client.execute("get","test",function(err,data){
                        should.not.exist(err)
                        should.exist(data)
                        data.toString().should.equal("hello")
                        client.execute("ERROR OP",10,function(err,data){
                            should.exist(err)
                            should.not.exist(data)
                             client.execute("get","test",function(err,data){
                                should.not.exist(err)
                                should.exist(data)
                                data.toString().should.equal("hello")
                                done()
                             })
                        })
                     })
                })

            })
        })
    })
    describe("Pub / Sub",function(){
        var pub,sub
        beforeEach(function(done){
           var counter = 0
           var error = function(err){
                done(err)
            }
            var ok = function(){
                this.execute("FLUSHALL",function(err){
                    counter++
                    if(counter == 2)
                        done()
                })
            }
            pub = redisClient.createClient(redisConf.port,redisConf.host,{"return_buffers":false})
            sub = redisClient.createClient(redisConf.port,redisConf.host,{"return_buffers":false})
            
            pub.on("ready",ok)
            pub.on("error",error)
            sub.on("ready",ok)
            sub.on("error",error)

        })
        afterEach(function(done){
            if(pub)
                pub.quit()
            if(sub)
                sub.quit()
            process.nextTick(function(){
                done()
            })
        })

        it("should support simple pub / sub",function(done){
            sub.on("message",function(sub,message){
                sub.should.equal("test")
                message.should.equal("test message")
                done()
            }) 
            sub.execute("SUBSCRIBE","test",function(err){
                should.not.exist(err)
                pub.execute("PUBLISH","test","test message",function(err,data){
                    data.should.equal(1)
                    should.not.exist(err)
                })
            })
        })
        it("should support psubscribers",function(done){
            var counter = 0 
            sub.on("pmessage",function(pattern,channel,message){
                pattern.should.equal("t*")
                if(channel != "test" && channel != "te")
                    done("Channel error: "+channel)
                message.should.equal("test message")
                counter++
                if(counter == 2)
                    done()
            }) 
            sub.execute("PSUBSCRIBE","t*",function(err){
                should.not.exist(err)
                pub.execute("PUBLISH","test","test message",function(err,data){
                    data.should.equal(1)
                    should.not.exist(err)
                    pub.execute("PUBLISH","te","test message",function(err,data){
                      data.should.equal(1)
                      should.not.exist(err)
                    })
                })
            })
        })
        
        it("should support many subscribers and psubscribers at the same time",function(done){
            var counter = 0
            var checker = function(){
                counter++
                if(counter == 4)
                    done()
            }
            sub.on("message", checker)
            sub.on("pmessage", checker)

            sub.execute("PSUBSCRIBE","t*",function(err){
                should.not.exist(err)
                sub.execute("PSUBSCRIBE","a*",function(err){
                    should.not.exist(err)
                    sub.execute("SUBSCRIBE","add",function(err){
                        should.not.exist(err)
                        sub.execute("SUBSCRIBE","test",function(err){
                            should.not.exist(err)
                            pub.execute("PUBLISH","test","test message",function(err,data){
                              data.should.equal(2)
                              should.not.exist(err)
                              pub.execute("PUBLISH","add","test message",function(err,data){
                                  data.should.equal(2)
                                  should.not.exist(err)
                              })
                            })
                        })
                    })
                })
            })
        })

        it("should enable enter and exit from pub/sub mode",function(done){
            sub.isSubscribed.should.not.be.ok
            sub.execute("SUBSCRIBE","test",function(err){
                sub.isSubscribed.should.be.ok
                should.not.exist(err)
                sub.execute("SET","test1",function(err,data){
                    sub.isSubscribed.should.be.ok
                    should.exist(err)
                    sub.execute("UNSUBSCRIBE","test",function(err){
                        sub.isSubscribed.should.not.be.ok
                        should.not.exist(err)
                        sub.execute("SET","test","test",function(err,data){
                            should.not.exist(err)
                            done()
                        })
                    })
                })
            })
        })
    })
})
