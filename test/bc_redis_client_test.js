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
        before(function(done){
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
        after(function(){
            if(client)
                client.quit()
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
})
