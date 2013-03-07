#Simple Redis Client

It's a pretty simple and basic redis client, designed to be very fast and keep all code simple. 

## How to install it?

    npm install simple_redis_client

## How to use?
        
    var redisClient = require("simple_redis_client")
    var myClient = redisClient.createClient(6379,"127.0.0.1") 
    myClient.on("ready",function(){
        myClient.execute("set","hello","world",function(err){
            myClient.execute("get","hello",function(err,data){
                console.log(data.toString())
            })
        })
    })

## Why to Use?

* It's extremly fast using buffers compared to other node.js redis clients
* It has an standar interface that could support any new command without code modifications (ever than the protocol continue being the same)
* Only 192 lines of code for the client
* Based on the native c++ hiredis parser (https://github.com/pietern/hiredis-node)

## Advance Options
 'createClient' support 3 arguments 'host','port' and 'options', options is optional, if you want to use it, It could have next options

    var options={
        return_buffers: Boolean (decide if the return value will be string or buffer, default: true),
        recheck_time: Number (If a disconnect occurs, It's the time in miliseconds between recoinnect tries, default: 1000),
        connectTimeout:  Number (It's the time before emit an error while the connection is creating, default: undefined),
    }

## Benchmarks

    npm install metrics
    node multi_bench.js
