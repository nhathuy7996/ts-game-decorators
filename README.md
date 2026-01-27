# ts-game-decorators

A TypeScript library for auto-routing Express APIs and Socket.IO events using decorators. Simplifies backend code for scalable Node.js applications.

## Features
- Decorators for Express route/controller (@RouterController, @Get, @Post, @Authen)
- Decorators for Socket.IO event handler (@SocketService, @OnEvent, @OnDisconnect, @OnError, @AuthenSocket)
- Unified `initServer` function to bootstrap Express + Socket.IO + Redis adapter
  - Supports `authAPIMiddleware` for Express and `authSocketMiddleware` for Socket.IO (can be used globally or for method-level `@AuthenSocket`)
- TypeScript-first, auto .d.ts

## Installation
```sh
npm install ts-game-decorators
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
export interface InitOptions {
    port: number;
    apiControllers?: any[];
    socketServices?: any[];
    authAPIMiddleware?: any;
    onReady?: (app: Express, io: SocketIOServer, httpServer: HTTPServer) => void;
    publicPath?: string;
    expressConfig?: (app: Express) => void;
    socketConfig?: (io: SocketIOServer) => void;
    createRedisAdapter?: () => Promise<any>;
}
```

You can simple call InitServer to create your game server
```ts
import { authAPIToken, createRedisAdapter, initServer, utils } from 'ts-game-decorators';
import { PublicAPI, PrivateAPI } from './api';
import { GameSocketService } from './socket';
import { authAPIToken } from './middleware/auth';
import { createRedisAdapter } from './config/redis';

const publicPath = path.join(__dirname, 'public');

initServer({
  port: 3000,
  createRedisAdapter,
  apiControllers: [PublicAPI, PrivateAPI],
  socketServices: [GameSocketService],
  onReady: () => console.log('Server ready!'),
  publicPath: publicPath,
  authAPIMiddleware: authAPIToken,
    expressConfig: (app)=>{
    app.use('/',(req: any, res: any)=>{
        console.log(`Incoming request: ${req.method} ${req.url}`);
        res.send('Hello from the server!');
    });
});
```

### 4. Create token

```ts
import {utils} from "ts-game-decorators";
let token = utils.tokenEncode({"userId":123});
```

data pass to tokenEncode must have userId for authen purpose!

### 5. using couchbase DB

```ts
import { connectToCouchbase, getCollection, queryData } from "ts-game-decorators";

async function exampleDB(){
  await connectToCouchbase;
  const userCollection = getCollection('users'); // optional scopeName

    //update
    userCollection.upsert('user::12345', { name: 'John Doe', score: 1000 })
    .then(() => {
        console.log('User upserted successfully');
    })
    .catch((err) => {
        console.error('Error upserting user:', err);
    });

    //get
    userCollection.get('user::12345')
    .then((result) => {
        console.log('User data:', result.value);
    })
    .catch((err) => {
         console.error('Error getting user:', err);
    });

    //query
  const rows = await queryData('SELECT * FROM `gamedevtoi`._default.users LIMIT 10;');
}
```

### 6. .env config

```
HTTP_PORT=3000

DISCORD_TOKEN=""
CHANNEL_ID=""
JWT_SECRET=""

TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHATID=""
TELEGRAM_THREAD_ID=0

COUCHBASE_URL=""
COUCHBASE_USERNAME=""
COUCHBASE_PASSWORD=""
COUCHBASE_BUCKET=""

REDIS_URL=""
REDIS_USERNAME=""
REDIS_PASSWORD="" 
```

## License
MIT
