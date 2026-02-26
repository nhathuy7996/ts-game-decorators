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
SERVER_ID="prefix-1"
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

### 8. Server Registry (Multi-instance Tracking)

Built-in server registry to track active server instances in a multi-server deployment using Redis Heartbeat.

#### How it works

Each server instance periodically writes a heartbeat to a shared Redis Hash (`server:registry`). Results are cached in memory and refreshed automatically every heartbeat cycle — so game loops can query server state at **zero Redis cost**.

```
[Server 1] ──heartbeat──▶ Redis (server:registry)
[Server 2] ──heartbeat──▶ Redis (server:registry)

Memory cache (auto-refreshed every 10s):
  { count: 2, myIndex: 0, servers: [...] }
```

#### Setup

Call `startServerRegistry()` after Redis is connected, and `stopServerRegistry()` on shutdown:

```ts
import { createRedisAdapter, startServerRegistry, stopServerRegistry } from 'ts-game-decorators';

initServer({
  port: 3000,
  createRedisAdapter,
  onReady: async () => {
    await startServerRegistry();
    console.log('Server registry started!');
  },
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await stopServerRegistry();
});
```

#### Reading server info in a game loop (Zero Redis cost)

Use the `getCached*` functions inside high-frequency loops (e.g. 60 FPS update). These read from in-memory cache only — **no Redis calls**.

```ts
import { getCachedServerCount, getCachedServerIndex, getCachedActiveServers } from 'ts-game-decorators';

class GameController {
  update(deltaTime: number) {
    // ⚡ ZERO COST — reads from memory, never touches Redis
    const total   = getCachedServerCount();    // e.g. 3
    const myIndex = getCachedServerIndex();    // e.g. 1  (0-based, sorted by serverId)

    // Example: partition world zones across servers
    // Server 0 → zone 0, Server 1 → zone 1, ...
    const myZone = myIndex;
  }
}
```

|         Function           | Redis calls |      Use case        |
|----------------------------|-------------|----------------------|
| `getCachedServerCount()`   | **0**       | game loop, anywhere  |
| `getCachedServerIndex()`   | **0**       | game loop, anywhere  |
| `getCachedActiveServers()` | **0**       | game loop, anywhere  |
| `getActiveServerCount()`   | 2           | admin API, monitoring|
| `getActiveServers()`       | 2           | admin API, monitoring|

#### Querying real-time data (e.g. admin API)

```ts
import { getActiveServers, getActiveServerCount } from 'ts-game-decorators';

// Force-refresh cache then return result
const count   = await getActiveServerCount();
const servers = await getActiveServers();

// Each ServerInfo contains:
// { serverId, hostname, pid, startedAt, lastHeartbeat }
```

#### Identifying server instances

Each instance gets a unique `SERVER_ID` automatically. Override via environment variable for explicit naming (e.g. in Docker/PM2):

```sh
# Automatic (default): "hostname-PID"
node dist/index.js

# Explicit (recommended for production):
SERVER_ID=pokemon-server-1 node dist/index.js
SERVER_ID=pokemon-server-2 node dist/index.js
```

```ts
import { SERVER_ID } from 'ts-game-decorators';
console.log(`Running as: ${SERVER_ID}`);
```

#### SERVER_ID & cache index stability

`getCachedServerIndex()` returns the position of the current server in a **sorted list** of all active servers. The sort uses **natural order** (numeric suffix aware), so `server-2 < server-10` works correctly.

| `SERVER_ID` mode              | Index stable across restarts? | Reason                                              |
|-------------------------------|-------------------------------|-----------------------------------------------------|
| Auto `hostname-PID`           | ❌ No                         | PID changes every restart → different sort order    |
| Manual `server-1`, `server-2` | ✅ Yes                        | Fixed string → always same sort position            |

How natural sort works:

```
SERVER_ID           naturalKey()              sort index
─────────────────────────────────────────────────────────
pokemon-server-1  → ["pokemon-server-", 1]  →  0
pokemon-server-2  → ["pokemon-server-", 2]  →  1
pokemon-server-10 → ["pokemon-server-", 10] →  2  ✅ correct
```

> ⚠️ Without natural sort, lexicographic order would give `server-10` index 1 and `server-2` index 2 — which is wrong.

**Recommended naming convention for production:**

```sh
# ✅ Good — same prefix, number at the end
SERVER_ID=pokemon-server-1
SERVER_ID=pokemon-server-2
SERVER_ID=pokemon-server-10

# ✅ Also fine — different prefixes sort alphabetically first
SERVER_ID=asia-server-1
SERVER_ID=eu-server-1

# ⚠️ Avoid — no numeric suffix, index order is harder to predict
SERVER_ID=main-server
SERVER_ID=backup-server
```


#### .env config for heartbeat tuning

The following are defaults baked into the library. No `.env` changes needed unless you want to override them in future releases:

| Setting              | Default         |                 Description                              |
|----------------------|-----------------|----------------------------------------------------------|
| `HEARTBEAT_TTL`      | 30s             | Time before a silent server is declared dead             |
| `HEARTBEAT_INTERVAL` | 10s             | How often each server sends a heartbeat                  |
| `SERVER_ID`          | `hostname-PID`  | Unique identifier for this instance                      |

---

## Troubleshooting

### Redis `ConnectionTimeoutError` when running multiple server instances

**Symptom:** Server 1 runs fine. When Server 2 starts, Server 1 logs repeated errors:

```
❌ Redis Subscriber Error: ConnectionTimeoutError: Connection timeout
❌ Redis Publisher Error: ConnectionTimeoutError: Connection timeout
```

Server 1 recovers only after Server 2 is stopped.

**Root cause: NAT/Firewall idle connection timeout**

When Redis and game servers are on separate machines, TCP connections pass through a firewall or NAT that tracks active connections. If a connection is **idle** (no traffic) longer than the firewall's idle timeout (typically 60–350s depending on cloud provider), the firewall silently drops its tracking entry. When Server 2 starts and generates traffic, Server 1's idle connections get displaced or expire — causing the timeout.

```
Server 1 → idle for >60s → Firewall drops tracking entry
Server 2 starts → flood of new packets
Server 1 sends packet → Firewall has no entry → packet dropped → ConnectionTimeoutError
```

**Cloud firewall idle timeouts (reference):**

| Provider              | Default idle timeout |
|-----------------------|----------------------|
| AWS Security Group    | No idle timeout ✅   |
| AWS NAT Gateway       | 350s                 |
| GCP Firewall          | 120s ⚠️              |
| DigitalOcean          | 60–120s ⚠️           |
| Self-hosted (iptables)| Depends on config    |

**Fix 1 — Redis server (run once):**

```bash
# Reduce Redis TCP keepalive from 300s to 60s
# Redis will send TCP probe every 60s → firewall entry stays alive
redis-cli CONFIG SET tcp-keepalive 60

# Ensure Redis never closes idle connections
redis-cli CONFIG SET timeout 0

# Save permanently
redis-cli CONFIG REWRITE
```

**Fix 2 — Client code (already configured in this library):**

The `createRedisAdapter` function is already configured with:

```ts
socket: {
    // Retry indefinitely — client is NEVER permanently destroyed
    reconnectStrategy: (retries) => Math.min(retries * 200, 10_000),

    // Connection establishment timeout
    connectTimeout: 10_000,

    // Client sends TCP keepalive probe every 15s
    // Must be lower than the shortest firewall idle timeout in your infra
    keepAlive: 15_000,
}
```

> ⚠️ Do NOT use `return new Error(...)` in `reconnectStrategy` — it permanently destroys the Redis client and prevents all future reconnections.

**Checklist to verify:**

```bash
redis-cli CONFIG GET timeout        # should be "0"
redis-cli CONFIG GET tcp-keepalive  # should be "60" (not 300)
redis-cli CONFIG GET maxclients     # should be well above total connections
redis-cli INFO clients              # check connected_clients vs maxclients
```

## License
MIT
