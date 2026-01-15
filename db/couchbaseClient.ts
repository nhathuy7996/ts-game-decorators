import couchbase, { Cluster, Bucket, Collection, DocumentNotFoundError } from 'couchbase'; 
import dotenv from "dotenv";  

dotenv.config();

let cluster: Cluster;
let bucket: Bucket;

let dataCollection: Map<string,Collection>; 

export async function connectToCouchbase(): Promise<Bucket> {
    try {
        // Kết nối với Couchbase Cluster
        cluster = await Cluster.connect(`couchbase://${process.env.COUCHBASE_URL || 'localhost'}`, {
            username: process.env.COUCHBASE_USERNAME || 'admin',
            password: process.env.COUCHBASE_PASSWORD || 'password',
        });
    
        // Lấy bucket từ cluster
        bucket = cluster.bucket(process.env.COUCHBASE_BUCKET || 'gamedevtoi');

        //Get collection 
        dataCollection = new Map();
        console.log('✅ Connected to Couchbase');

        return bucket;
      } catch (err) {
        console.error('❌ Failed to connect to Couchbase:', err);
        return Promise.reject(err);
      } 
}

/*
* query Data from couchbase
* @param query: string
* @returns array of rows
*/
export async function queryData(query: string){
    try {
        const result = await cluster.query(query);
        return result.rows; // Return array of rows
      } catch (err) {
        console.error('Error executing query:', err);
        throw new Error('Failed to fetch top users');
      }
}

export function getCollection(name: string): Collection {
  if (!dataCollection) {
    throw new Error('Couchbase is not connected. Call connectToCouchbase first.');
  }
  let collection = dataCollection.get(name);
  if (!collection) {
    collection = bucket.collection(name);
    dataCollection.set(name, collection);
    return collection;
  }

  return collection;
}
