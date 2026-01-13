# express-socket-decorators

A TypeScript library for auto-routing Express APIs and Socket.IO events using decorators. Simplifies backend code for scalable Node.js applications.

## Features
- Decorators for Express route/controller (@RouterController, @Get, @Post, @Authen)
- Decorators for Socket.IO event handler (@SocketService, @OnEvent, @OnDisconnect, @OnError, @AuthenSocket)
- Unified `initServer` function to bootstrap Express + Socket.IO + Redis adapter
- TypeScript-first, auto .d.ts

## Installation
```sh
npm install express-socket-decorators
```

## TypeScript Configuration
add `tsconfig.json`:
```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false
  }
}
```

## Usage Example

### 1. API Controller
```ts
import { RouterController, Get, Post, Authen } from 'express-socket-decorators';

@RouterController('/api/public')
export class PublicAPI {
  @Get('/hello')
  hello(req, res) {
    res.json({ msg: 'Hello world!' });
  }
}

@RouterController('/api/private')
@Authen()
export class PrivateAPI {
  @Get('/profile')
  profile(req, res) {
    res.json({ user: req.userId });
  }
}
```

### 2. Socket Service
```ts
import { SocketService, OnEvent, OnDisconnect, AuthenSocket } from 'express-socket-decorators';

@SocketService()
export class GameSocketService {

    private io: Server;
    constructor(io: Server) {
        this.io = io;
    }

  @OnEvent('startGame')
  @AuthenSocket()
  start(socket, data) {
    // ...
  }

  @OnDisconnect()
  disconnect(socket) {
    // ...
  }
}
```

### 3. Bootstrap Server
```ts
import { initServer } from 'express-socket-decorators';
import { PublicAPI, PrivateAPI } from './api';
import { GameSocketService } from './socket';
import { authAPIToken } from './middleware/auth';
import { createRedisAdapter } from './config/redis';

initServer({
  port: 3000,
  apiControllers: [PublicAPI, PrivateAPI],
  socketServices: [GameSocketService],
  authAPIMiddleware: authAPIToken,
  createRedisAdapter,
  publicPath: __dirname + '/public',
  onReady: () => console.log('Server ready!')
});
```

## License
MIT
