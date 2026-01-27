# ts-game-decorators

A TypeScript library for auto-routing Express APIs and Socket.IO events using decorators. Simplifies backend code for scalable Node.js applications.

## Features
- Decorators for Express route/controller (@RouterController, @Get, @Post, @Authen)
- Decorators for Socket.IO event handler (@SocketService, @OnEvent, @OnDisconnect, @OnError, @AuthenSocket)
- Business Exception Handling with automatic error response formatting
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

### 3. Business Exception Handling

The library includes a built-in business exception system that automatically handles errors and formats responses.

#### Features
- Define enum-like business exceptions (similar to Java enums)
- Automatic error response formatting: `{ success: false, message: string, code: number }`
- Automatic HTTP status code mapping
- Type-safe exception definitions
- Works with all routes (authenticated and public)

#### Creating Business Exceptions

```ts
import { createBusinessMessage } from 'ts-game-decorators';

export const ShopBusinessMessage = createBusinessMessage({
  ITEM_NOT_FOUND: [11005, "Item not found in shop config", 404],
  INVALID_REQUEST: [11001, "Invalid request", 400],
  CURRENCY_NOT_ENOUGH: [11007, "Currency not enough", 400],
  INTERNAL_ERROR: [11000, "Internal server error", 500],
});
```

#### Throwing Business Exceptions

```ts
import { BusinessException } from 'ts-game-decorators';
import { ShopBusinessMessage } from './exceptions/shopException';

@RouterController('/api/shop')
export class ShopAPI {
  @Get('/:itemId')
  async getItem(req, res) {
    const item = await findItem(req.params.itemId);
    
    if (!item) {
      throw new BusinessException(ShopBusinessMessage.ITEM_NOT_FOUND);
    }
    
    res.json({ success: true, data: item });
  }
}
```

#### Automatic Response Example

When throwing `BusinessException(ShopBusinessMessage.ITEM_NOT_FOUND)`:

**Response (HTTP 404):**
```json
{
  "success": false,
  "message": "Item not found in shop config",
  "code": 11005
}
```

### 4. Bootstrap Server

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

### 5. Create token

```ts
import {utils} from "ts-game-decorators";
let token = utils.tokenEncode({"userId":123});
```

data pass to tokenEncode must have userId for authen purpose!

### 6. using couchbase DB

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

### 7. .env config

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
