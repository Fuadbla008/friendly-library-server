import express from 'express';
import { MongoClient } from 'mongodb';
import cors from 'cors';
import 'dotenv/config'

console.log(process.env.MONGODB_USER);
const client = new MongoClient(`mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@dataset1.z4m5int.mongodb.net/`);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('hellow data')
});

app.listen(port, () => {
    console.log('server is running on port 5000')
});