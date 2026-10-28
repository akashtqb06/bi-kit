import pg from 'pg';
import mysql from 'mysql2/promise';
import mssql from 'mssql';
import { MongoClient } from 'mongodb';
import { generateDataset, type DemoDataset } from './demo-data';

interface TargetStatus {
    name: string;
    success: boolean;
    error?: string;
}

async function seedPostgres(dataset: DemoDataset): Promise<void> {
    const config = {
        host: process.env.PG_HOST || 'localhost',
        port: Number(process.env.PG_PORT || 5433),
        database: process.env.PG_DATABASE || 'bikit_dev',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || 'bi_password_123!',
        connectionTimeoutMillis: 3000,
    };

    const client = new pg.Client(config);
    await client.connect();

    try {
        console.log('[Postgres] Connected. Creating schema...');
        await client.query(`
            DROP TABLE IF EXISTS reviews CASCADE;
            DROP TABLE IF EXISTS order_items CASCADE;
            DROP TABLE IF EXISTS orders CASCADE;
            DROP TABLE IF EXISTS products CASCADE;
            DROP TABLE IF EXISTS sellers CASCADE;
            DROP TABLE IF EXISTS customers CASCADE;

            CREATE TABLE customers (
                customer_id VARCHAR(32) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                city VARCHAR(100) NOT NULL,
                state VARCHAR(100) NOT NULL,
                region VARCHAR(50) NOT NULL,
                signup_date TIMESTAMP NOT NULL
            );

            CREATE TABLE sellers (
                seller_id VARCHAR(32) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                city VARCHAR(100) NOT NULL,
                state VARCHAR(100) NOT NULL,
                region VARCHAR(50) NOT NULL,
                joined_date TIMESTAMP NOT NULL
            );

            CREATE TABLE products (
                product_id VARCHAR(32) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                seller_id VARCHAR(32) NOT NULL REFERENCES sellers(seller_id),
                price NUMERIC(10, 2) NOT NULL,
                cost NUMERIC(10, 2) NOT NULL,
                created_at TIMESTAMP NOT NULL
            );

            CREATE TABLE orders (
                order_id VARCHAR(32) PRIMARY KEY,
                id VARCHAR(32) NOT NULL,
                customer_id VARCHAR(32) NOT NULL REFERENCES customers(customer_id),
                status VARCHAR(50) NOT NULL,
                order_status VARCHAR(50) NOT NULL,
                created_at TIMESTAMP NOT NULL,
                order_purchase_timestamp TIMESTAMP NOT NULL,
                order_delivered_timestamp TIMESTAMP,
                total NUMERIC(12, 2) NOT NULL DEFAULT 0,
                payment_type VARCHAR(50) NOT NULL
            );

            CREATE TABLE order_items (
                order_item_id SERIAL PRIMARY KEY,
                order_id VARCHAR(32) NOT NULL REFERENCES orders(order_id),
                product_id VARCHAR(32) NOT NULL,
                seller_id VARCHAR(32) NOT NULL,
                quantity INT NOT NULL,
                price NUMERIC(10, 2) NOT NULL,
                freight_value NUMERIC(10, 2) NOT NULL
            );

            CREATE TABLE reviews (
                review_id VARCHAR(32) PRIMARY KEY,
                order_id VARCHAR(32) NOT NULL UNIQUE REFERENCES orders(order_id),
                rating INT NOT NULL,
                created_at TIMESTAMP NOT NULL
            );
        `);

        console.log('[Postgres] Inserting customers...');
        for (let i = 0; i < dataset.customers.length; i += 500) {
            const batch = dataset.customers.slice(i, i + 500);
            const values: unknown[] = [];
            const placeholders = batch.map((r, idx) => {
                const base = idx * 7;
                values.push(r.customer_id, r.name, r.email, r.city, r.state, r.region, r.signup_date);
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
            }).join(', ');
            await client.query(`INSERT INTO customers VALUES ${placeholders}`, values);
        }

        console.log('[Postgres] Inserting sellers...');
        for (let i = 0; i < dataset.sellers.length; i += 500) {
            const batch = dataset.sellers.slice(i, i + 500);
            const values: unknown[] = [];
            const placeholders = batch.map((r, idx) => {
                const base = idx * 6;
                values.push(r.seller_id, r.name, r.city, r.state, r.region, r.joined_date);
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
            }).join(', ');
            await client.query(`INSERT INTO sellers VALUES ${placeholders}`, values);
        }

        console.log('[Postgres] Inserting products...');
        for (let i = 0; i < dataset.products.length; i += 500) {
            const batch = dataset.products.slice(i, i + 500);
            const values: unknown[] = [];
            const placeholders = batch.map((r, idx) => {
                const base = idx * 7;
                values.push(r.product_id, r.name, r.category, r.seller_id, r.price, r.cost, r.created_at);
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
            }).join(', ');
            await client.query(`INSERT INTO products VALUES ${placeholders}`, values);
        }

        console.log('[Postgres] Inserting orders...');
        for (let i = 0; i < dataset.orders.length; i += 500) {
            const batch = dataset.orders.slice(i, i + 500);
            const values: unknown[] = [];
            const placeholders = batch.map((r, idx) => {
                const base = idx * 10;
                values.push(
                    r.order_id, r.id, r.customer_id, r.status, r.order_status,
                    r.created_at, r.order_purchase_timestamp, r.order_delivered_timestamp,
                    r.total, r.payment_type
                );
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`;
            }).join(', ');
            await client.query(`INSERT INTO orders VALUES ${placeholders}`, values);
        }

        console.log('[Postgres] Inserting order items...');
        for (let i = 0; i < dataset.orderItems.length; i += 500) {
            const batch = dataset.orderItems.slice(i, i + 500);
            const values: unknown[] = [];
            const placeholders = batch.map((r, idx) => {
                const base = idx * 6;
                values.push(r.order_id, r.product_id, r.seller_id, r.quantity, r.price, r.freight_value);
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
            }).join(', ');
            await client.query(`INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, freight_value) VALUES ${placeholders}`, values);
        }

        console.log('[Postgres] Inserting reviews...');
        for (let i = 0; i < dataset.reviews.length; i += 500) {
            const batch = dataset.reviews.slice(i, i + 500);
            const values: unknown[] = [];
            const placeholders = batch.map((r, idx) => {
                const base = idx * 4;
                values.push(r.review_id, r.order_id, r.rating, r.created_at);
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
            }).join(', ');
            await client.query(`INSERT INTO reviews VALUES ${placeholders}`, values);
        }

        console.log('[Postgres] Seeding complete.');
    } finally {
        await client.end();
    }
}

async function seedMysql(dataset: DemoDataset): Promise<void> {
    const conn = await mysql.createConnection({
        host: process.env.MYSQL_HOST || 'localhost',
        port: Number(process.env.MYSQL_PORT || 3307),
        database: process.env.MYSQL_DATABASE || 'bikit_dev',
        user: process.env.MYSQL_USER || 'mysql',
        password: process.env.MYSQL_PASSWORD || 'bi_password_123!',
        connectTimeout: 3000,
    });

    try {
        console.log('[MySQL] Connected. Creating schema...');
        await conn.execute('DROP TABLE IF EXISTS reviews');
        await conn.execute('DROP TABLE IF EXISTS order_items');
        await conn.execute('DROP TABLE IF EXISTS orders');
        await conn.execute('DROP TABLE IF EXISTS products');
        await conn.execute('DROP TABLE IF EXISTS sellers');
        await conn.execute('DROP TABLE IF EXISTS customers');

        await conn.execute(`
            CREATE TABLE customers (
                customer_id VARCHAR(32) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                city VARCHAR(100) NOT NULL,
                state VARCHAR(100) NOT NULL,
                region VARCHAR(50) NOT NULL,
                signup_date DATETIME NOT NULL
            ) ENGINE=InnoDB;
        `);

        await conn.execute(`
            CREATE TABLE sellers (
                seller_id VARCHAR(32) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                city VARCHAR(100) NOT NULL,
                state VARCHAR(100) NOT NULL,
                region VARCHAR(50) NOT NULL,
                joined_date DATETIME NOT NULL
            ) ENGINE=InnoDB;
        `);

        await conn.execute(`
            CREATE TABLE products (
                product_id VARCHAR(32) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                seller_id VARCHAR(32) NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                cost DECIMAL(10, 2) NOT NULL,
                created_at DATETIME NOT NULL,
                FOREIGN KEY (seller_id) REFERENCES sellers(seller_id)
            ) ENGINE=InnoDB;
        `);

        await conn.execute(`
            CREATE TABLE orders (
                order_id VARCHAR(32) PRIMARY KEY,
                id VARCHAR(32) NOT NULL,
                customer_id VARCHAR(32) NOT NULL,
                status VARCHAR(50) NOT NULL,
                order_status VARCHAR(50) NOT NULL,
                created_at DATETIME NOT NULL,
                order_purchase_timestamp DATETIME NOT NULL,
                order_delivered_timestamp DATETIME NULL,
                total DECIMAL(12, 2) NOT NULL DEFAULT 0,
                payment_type VARCHAR(50) NOT NULL,
                FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
            ) ENGINE=InnoDB;
        `);

        await conn.execute(`
            CREATE TABLE order_items (
                order_item_id INT AUTO_INCREMENT PRIMARY KEY,
                order_id VARCHAR(32) NOT NULL,
                product_id VARCHAR(32) NOT NULL,
                seller_id VARCHAR(32) NOT NULL,
                quantity INT NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                freight_value DECIMAL(10, 2) NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(order_id)
            ) ENGINE=InnoDB;
        `);

        await conn.execute(`
            CREATE TABLE reviews (
                review_id VARCHAR(32) PRIMARY KEY,
                order_id VARCHAR(32) NOT NULL UNIQUE,
                rating INT NOT NULL,
                created_at DATETIME NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(order_id)
            ) ENGINE=InnoDB;
        `);

        console.log('[MySQL] Inserting customers...');
        for (let i = 0; i < dataset.customers.length; i += 500) {
            const batch = dataset.customers.slice(i, i + 500);
            const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
            const values = batch.flatMap(r => [r.customer_id, r.name, r.email, r.city, r.state, r.region, r.signup_date]);
            await conn.query(`INSERT INTO customers VALUES ${placeholders}`, values);
        }

        console.log('[MySQL] Inserting sellers...');
        for (let i = 0; i < dataset.sellers.length; i += 500) {
            const batch = dataset.sellers.slice(i, i + 500);
            const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            const values = batch.flatMap(r => [r.seller_id, r.name, r.city, r.state, r.region, r.joined_date]);
            await conn.query(`INSERT INTO sellers VALUES ${placeholders}`, values);
        }

        console.log('[MySQL] Inserting products...');
        for (let i = 0; i < dataset.products.length; i += 500) {
            const batch = dataset.products.slice(i, i + 500);
            const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
            const values = batch.flatMap(r => [r.product_id, r.name, r.category, r.seller_id, r.price, r.cost, r.created_at]);
            await conn.query(`INSERT INTO products VALUES ${placeholders}`, values);
        }

        console.log('[MySQL] Inserting orders...');
        for (let i = 0; i < dataset.orders.length; i += 500) {
            const batch = dataset.orders.slice(i, i + 500);
            const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
            const values = batch.flatMap(r => [
                r.order_id, r.id, r.customer_id, r.status, r.order_status,
                r.created_at, r.order_purchase_timestamp, r.order_delivered_timestamp,
                r.total, r.payment_type
            ]);
            await conn.query(`INSERT INTO orders VALUES ${placeholders}`, values);
        }

        console.log('[MySQL] Inserting order items...');
        for (let i = 0; i < dataset.orderItems.length; i += 500) {
            const batch = dataset.orderItems.slice(i, i + 500);
            const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            const values = batch.flatMap(r => [r.order_id, r.product_id, r.seller_id, r.quantity, r.price, r.freight_value]);
            await conn.query(`INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, freight_value) VALUES ${placeholders}`, values);
        }

        console.log('[MySQL] Inserting reviews...');
        for (let i = 0; i < dataset.reviews.length; i += 500) {
            const batch = dataset.reviews.slice(i, i + 500);
            const placeholders = batch.map(() => '(?, ?, ?, ?)').join(', ');
            const values = batch.flatMap(r => [r.review_id, r.order_id, r.rating, r.created_at]);
            await conn.query(`INSERT INTO reviews VALUES ${placeholders}`, values);
        }

        console.log('[MySQL] Seeding complete.');
    } finally {
        await conn.end();
    }
}

async function seedMssql(dataset: DemoDataset): Promise<void> {
    const config: mssql.config = {
        server: process.env.MSSQL_HOST || 'localhost',
        port: Number(process.env.MSSQL_PORT || 1434),
        user: process.env.MSSQL_USER || 'sa',
        password: process.env.MSSQL_PASSWORD || 'Bi_Strong_Password_123!',
        options: {
            encrypt: false,
            trustServerCertificate: true,
            connectTimeout: 5000,
        },
    };

    const pool = await new mssql.ConnectionPool(config).connect();

    try {
        console.log('[MSSQL] Connected. Creating database bikit_dev if needed...');
        await pool.request().batch(`
            IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'bikit_dev')
            BEGIN
                CREATE DATABASE bikit_dev;
            END;
        `);

        await pool.request().batch(`
            USE bikit_dev;

            IF OBJECT_ID('reviews', 'U') IS NOT NULL DROP TABLE reviews;
            IF OBJECT_ID('order_items', 'U') IS NOT NULL DROP TABLE order_items;
            IF OBJECT_ID('orders', 'U') IS NOT NULL DROP TABLE orders;
            IF OBJECT_ID('products', 'U') IS NOT NULL DROP TABLE products;
            IF OBJECT_ID('sellers', 'U') IS NOT NULL DROP TABLE sellers;
            IF OBJECT_ID('customers', 'U') IS NOT NULL DROP TABLE customers;

            CREATE TABLE customers (
                customer_id NVARCHAR(32) PRIMARY KEY,
                name NVARCHAR(255) NOT NULL,
                email NVARCHAR(255) NOT NULL UNIQUE,
                city NVARCHAR(100) NOT NULL,
                state NVARCHAR(100) NOT NULL,
                region NVARCHAR(50) NOT NULL,
                signup_date DATETIME2 NOT NULL
            );

            CREATE TABLE sellers (
                seller_id NVARCHAR(32) PRIMARY KEY,
                name NVARCHAR(255) NOT NULL,
                city NVARCHAR(100) NOT NULL,
                state NVARCHAR(100) NOT NULL,
                region NVARCHAR(50) NOT NULL,
                joined_date DATETIME2 NOT NULL
            );

            CREATE TABLE products (
                product_id NVARCHAR(32) PRIMARY KEY,
                name NVARCHAR(255) NOT NULL,
                category NVARCHAR(100) NOT NULL,
                seller_id NVARCHAR(32) NOT NULL REFERENCES sellers(seller_id),
                price DECIMAL(10, 2) NOT NULL,
                cost DECIMAL(10, 2) NOT NULL,
                created_at DATETIME2 NOT NULL
            );

            CREATE TABLE orders (
                order_id NVARCHAR(32) PRIMARY KEY,
                id NVARCHAR(32) NOT NULL,
                customer_id NVARCHAR(32) NOT NULL REFERENCES customers(customer_id),
                status NVARCHAR(50) NOT NULL,
                order_status NVARCHAR(50) NOT NULL,
                created_at DATETIME2 NOT NULL,
                order_purchase_timestamp DATETIME2 NOT NULL,
                order_delivered_timestamp DATETIME2 NULL,
                total DECIMAL(12, 2) NOT NULL DEFAULT 0,
                payment_type NVARCHAR(50) NOT NULL
            );

            CREATE TABLE order_items (
                order_item_id INT IDENTITY(1,1) PRIMARY KEY,
                order_id NVARCHAR(32) NOT NULL REFERENCES orders(order_id),
                product_id NVARCHAR(32) NOT NULL,
                seller_id NVARCHAR(32) NOT NULL,
                quantity INT NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                freight_value DECIMAL(10, 2) NOT NULL
            );

            CREATE TABLE reviews (
                review_id NVARCHAR(32) PRIMARY KEY,
                order_id NVARCHAR(32) NOT NULL UNIQUE REFERENCES orders(order_id),
                rating INT NOT NULL,
                created_at DATETIME2 NOT NULL
            );
        `);

        console.log('[MSSQL] Inserting customers...');
        for (let i = 0; i < dataset.customers.length; i += 200) {
            const batch = dataset.customers.slice(i, i + 200);
            const values = batch.map(r =>
                `('${r.customer_id}', '${r.name.replace(/'/g, "''")}', '${r.email}', '${r.city}', '${r.state}', '${r.region}', '${r.signup_date}')`
            ).join(', ');
            await pool.request().query(`USE bikit_dev; INSERT INTO customers VALUES ${values}`);
        }

        console.log('[MSSQL] Inserting sellers...');
        for (let i = 0; i < dataset.sellers.length; i += 200) {
            const batch = dataset.sellers.slice(i, i + 200);
            const values = batch.map(r =>
                `('${r.seller_id}', '${r.name.replace(/'/g, "''")}', '${r.city}', '${r.state}', '${r.region}', '${r.joined_date}')`
            ).join(', ');
            await pool.request().query(`USE bikit_dev; INSERT INTO sellers VALUES ${values}`);
        }

        console.log('[MSSQL] Inserting products...');
        for (let i = 0; i < dataset.products.length; i += 200) {
            const batch = dataset.products.slice(i, i + 200);
            const values = batch.map(r =>
                `('${r.product_id}', '${r.name.replace(/'/g, "''")}', '${r.category}', '${r.seller_id}', ${r.price}, ${r.cost}, '${r.created_at}')`
            ).join(', ');
            await pool.request().query(`USE bikit_dev; INSERT INTO products VALUES ${values}`);
        }

        console.log('[MSSQL] Inserting orders...');
        for (let i = 0; i < dataset.orders.length; i += 200) {
            const batch = dataset.orders.slice(i, i + 200);
            const values = batch.map(r =>
                `('${r.order_id}', '${r.id}', '${r.customer_id}', '${r.status}', '${r.order_status}', '${r.created_at}', '${r.order_purchase_timestamp}', ${r.order_delivered_timestamp ? `'${r.order_delivered_timestamp}'` : 'NULL'}, ${r.total}, '${r.payment_type}')`
            ).join(', ');
            await pool.request().query(`USE bikit_dev; INSERT INTO orders VALUES ${values}`);
        }

        console.log('[MSSQL] Inserting order items...');
        for (let i = 0; i < dataset.orderItems.length; i += 200) {
            const batch = dataset.orderItems.slice(i, i + 200);
            const values = batch.map(r =>
                `('${r.order_id}', '${r.product_id}', '${r.seller_id}', ${r.quantity}, ${r.price}, ${r.freight_value})`
            ).join(', ');
            await pool.request().query(`USE bikit_dev; INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, freight_value) VALUES ${values}`);
        }

        console.log('[MSSQL] Inserting reviews...');
        for (let i = 0; i < dataset.reviews.length; i += 200) {
            const batch = dataset.reviews.slice(i, i + 200);
            const values = batch.map(r =>
                `('${r.review_id}', '${r.order_id}', ${r.rating}, '${r.created_at}')`
            ).join(', ');
            await pool.request().query(`USE bikit_dev; INSERT INTO reviews VALUES ${values}`);
        }

        console.log('[MSSQL] Seeding complete.');
    } finally {
        await pool.close();
    }
}

async function seedMongo(dataset: DemoDataset): Promise<void> {
    const host = process.env.MONGO_HOST || 'localhost';
    const port = Number(process.env.MONGO_PORT || 27018);
    const database = process.env.MONGO_DATABASE || 'bikit_dev';
    const user = process.env.MONGO_USER || 'mongoadmin';
    const password = process.env.MONGO_PASSWORD || 'bi_password_123!';
    const authSource = process.env.MONGO_AUTH_SOURCE || 'admin';

    const authPart = user && password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@` : '';
    const uri = `mongodb://${authPart}${host}:${port}/${database}?authSource=${encodeURIComponent(authSource)}`;

    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();

    try {
        console.log('[MongoDB] Connected. Seeding collections...');
        const db = client.db(database);

        // Drop existing collections
        const existing = await db.listCollections().toArray();
        const existingNames = new Set(existing.map((c) => c.name));

        const collsToDrop = ['customers', 'sellers', 'products', 'orders', 'order_items', 'reviews'];
        for (const name of collsToDrop) {
            if (existingNames.has(name)) {
                await db.collection(name).drop();
            }
        }

        console.log('[MongoDB] Inserting customers...');
        const customerDocs = dataset.customers.map((c) => ({
            ...c,
            signup_date: new Date(c.signup_date),
        }));
        for (let i = 0; i < customerDocs.length; i += 500) {
            await db.collection('customers').insertMany(customerDocs.slice(i, i + 500));
        }
        await db.collection('customers').createIndex({ customer_id: 1 }, { unique: true });
        await db.collection('customers').createIndex({ email: 1 });

        console.log('[MongoDB] Inserting sellers...');
        const sellerDocs = dataset.sellers.map((s) => ({
            ...s,
            joined_date: new Date(s.joined_date),
        }));
        for (let i = 0; i < sellerDocs.length; i += 500) {
            await db.collection('sellers').insertMany(sellerDocs.slice(i, i + 500));
        }
        await db.collection('sellers').createIndex({ seller_id: 1 }, { unique: true });

        console.log('[MongoDB] Inserting products...');
        const productDocs = dataset.products.map((p) => ({
            ...p,
            price: Number(p.price),
            cost: Number(p.cost),
            created_at: new Date(p.created_at),
        }));
        for (let i = 0; i < productDocs.length; i += 500) {
            await db.collection('products').insertMany(productDocs.slice(i, i + 500));
        }
        await db.collection('products').createIndex({ product_id: 1 }, { unique: true });
        await db.collection('products').createIndex({ seller_id: 1 });

        console.log('[MongoDB] Inserting orders...');
        const orderDocs = dataset.orders.map((o) => ({
            ...o,
            total: Number(o.total),
            created_at: new Date(o.created_at),
            order_purchase_timestamp: new Date(o.order_purchase_timestamp),
            order_delivered_timestamp: o.order_delivered_timestamp ? new Date(o.order_delivered_timestamp) : null,
        }));
        for (let i = 0; i < orderDocs.length; i += 500) {
            await db.collection('orders').insertMany(orderDocs.slice(i, i + 500));
        }
        await db.collection('orders').createIndex({ order_id: 1 }, { unique: true });
        await db.collection('orders').createIndex({ customer_id: 1 });

        console.log('[MongoDB] Inserting order items...');
        const itemDocs = dataset.orderItems.map((item, idx) => ({
            order_item_id: idx + 1,
            ...item,
            quantity: Number(item.quantity),
            price: Number(item.price),
            freight_value: Number(item.freight_value),
        }));
        for (let i = 0; i < itemDocs.length; i += 500) {
            await db.collection('order_items').insertMany(itemDocs.slice(i, i + 500));
        }
        await db.collection('order_items').createIndex({ order_id: 1 });
        await db.collection('order_items').createIndex({ product_id: 1 });

        console.log('[MongoDB] Inserting reviews...');
        const reviewDocs = dataset.reviews.map((r) => ({
            ...r,
            rating: Number(r.rating),
            created_at: new Date(r.created_at),
        }));
        for (let i = 0; i < reviewDocs.length; i += 500) {
            await db.collection('reviews').insertMany(reviewDocs.slice(i, i + 500));
        }
        await db.collection('reviews').createIndex({ review_id: 1 }, { unique: true });
        await db.collection('reviews').createIndex({ order_id: 1 });

        console.log('[MongoDB] Seeding complete.');
    } finally {
        await client.close();
    }
}

async function main() {
    const target = (process.env.TARGET_DB || 'all').toLowerCase();
    const dataset = generateDataset({ orderCount: 2000 });
    const statuses: TargetStatus[] = [];

    if (target === 'all' || target === 'postgres') {
        try {
            await seedPostgres(dataset);
            statuses.push({ name: 'PostgreSQL', success: true });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[PostgreSQL] Seed skipped/failed: ${msg}`);
            statuses.push({ name: 'PostgreSQL', success: false, error: msg });
        }
    }

    if (target === 'all' || target === 'mysql') {
        try {
            await seedMysql(dataset);
            statuses.push({ name: 'MySQL', success: true });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[MySQL] Seed skipped/failed: ${msg}`);
            statuses.push({ name: 'MySQL', success: false, error: msg });
        }
    }

    if (target === 'all' || target === 'mssql') {
        try {
            await seedMssql(dataset);
            statuses.push({ name: 'SQL Server', success: true });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[SQL Server] Seed skipped/failed: ${msg}`);
            statuses.push({ name: 'SQL Server', success: false, error: msg });
        }
    }

    if (target === 'all' || target === 'mongodb' || target === 'mongo') {
        try {
            await seedMongo(dataset);
            statuses.push({ name: 'MongoDB', success: true });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[MongoDB] Seed skipped/failed: ${msg}`);
            statuses.push({ name: 'MongoDB', success: false, error: msg });
        }
    }

    console.log('\n--- External DB Seed Summary ---');
    for (const s of statuses) {
        console.log(`${s.name}: ${s.success ? 'SUCCESS' : `SKIPPED (${s.error})`}`);
    }
}

main().catch(err => {
    console.error('External seed runner error:', err);
    process.exit(1);
});
