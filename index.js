import express from 'express';
import { MongoClient } from 'mongodb';
import cors from 'cors';
import 'dotenv/config'

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

console.log(process.env.MONGODB_USER);

const client = new MongoClient(`mongodb://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@ac-nkhxgqo-shard-00-00.z4m5int.mongodb.net:27017,ac-nkhxgqo-shard-00-01.z4m5int.mongodb.net:27017,ac-nkhxgqo-shard-00-02.z4m5int.mongodb.net:27017/?ssl=true&replicaSet=atlas-inuk23-shard-0&authSource=admin`);

export async function connetToMongodb() {
    try{
        await client.connect();
        console.log("succesfully connected to mongodb database");
        return client;
    }
    catch (err){
        console.dir(err);
    }
}

await connetToMongodb();

app.get('/', (req, res) => {
    res.send('hellow data')
});

app.listen(port, () => {
    console.log('server is running on port 5000')
});