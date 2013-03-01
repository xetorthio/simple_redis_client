define REDIS1_CONF
daemonize yes
port 6379
pidfile /tmp/redis1.pid
endef

export REDIS1_CONF


test:
	echo "$$REDIS1_CONF" | redis-server -;
	./node_modules/.bin/_mocha  --reporter spec -t 5000 -s 3000 ${REGEX} ${TESTFILE};
	redis-cli shutdown;

.PHONY: test
