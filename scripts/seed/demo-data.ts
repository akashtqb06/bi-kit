import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, SAMPLE_DB_PATH } from '@src/lib/db/paths';
import { assertTestIsolationGuard } from '@src/lib/db/guard';

const SEED = 0x5eed1234;
const DEFAULT_ORDER_COUNT = 12_000;
const BATCH_SIZE = 500;

const locations = [
    { city: 'Mumbai', state: 'Maharashtra', region: 'West' },
    { city: 'Pune', state: 'Maharashtra', region: 'West' },
    { city: 'Nagpur', state: 'Maharashtra', region: 'West' },
    { city: 'Ahmedabad', state: 'Gujarat', region: 'West' },
    { city: 'Surat', state: 'Gujarat', region: 'West' },
    { city: 'Bengaluru', state: 'Karnataka', region: 'South' },
    { city: 'Mysuru', state: 'Karnataka', region: 'South' },
    { city: 'Chennai', state: 'Tamil Nadu', region: 'South' },
    { city: 'Coimbatore', state: 'Tamil Nadu', region: 'South' },
    { city: 'Hyderabad', state: 'Telangana', region: 'South' },
    { city: 'Kochi', state: 'Kerala', region: 'South' },
    { city: 'Delhi', state: 'Delhi', region: 'North' },
    { city: 'Jaipur', state: 'Rajasthan', region: 'North' },
    { city: 'Lucknow', state: 'Uttar Pradesh', region: 'North' },
    { city: 'Chandigarh', state: 'Chandigarh', region: 'North' },
    { city: 'Kolkata', state: 'West Bengal', region: 'East' },
    { city: 'Patna', state: 'Bihar', region: 'East' },
    { city: 'Bhubaneswar', state: 'Odisha', region: 'East' },
    { city: 'Guwahati', state: 'Assam', region: 'East' },
    { city: 'Bhopal', state: 'Madhya Pradesh', region: 'Central' },
    { city: 'Indore', state: 'Madhya Pradesh', region: 'Central' },
];

const firstNames = [
    'Aarav',
    'Aditi',
    'Aditya',
    'Ananya',
    'Arjun',
    'Diya',
    'Ishaan',
    'Kavya',
    'Kabir',
    'Meera',
    'Neha',
    'Rohan',
    'Saanvi',
    'Vihaan',
    'Zoya',
    'Ira',
    'Dev',
    'Nisha',
    'Rahul',
    'Tara',
    'Aanya',
    'Karan',
    'Mira',
    'Om',
    'Priya',
    'Sahil',
    'Tanvi',
    'Vikram',
    'Yash',
    'Sana',
];

const lastNames = [
    'Sharma',
    'Patel',
    'Reddy',
    'Iyer',
    'Nair',
    'Mehta',
    'Singh',
    'Gupta',
    'Rao',
    'Khan',
    'Kulkarni',
    'Das',
    'Kapoor',
    'Joshi',
    'Pillai',
    'Chatterjee',
    'Verma',
    'Menon',
    'Desai',
    'Bose',
    'Saxena',
    'Mishra',
    'Naidu',
    'Bhat',
    'Malhotra',
    'Ghosh',
    'Jain',
    'Dutta',
    'Shetty',
    'Sinha',
];

const categories = [
    { name: 'Electronics', min: 1_200, max: 68_000 },
    { name: 'Home & Kitchen', min: 250, max: 18_000 },
    { name: 'Fashion', min: 300, max: 9_000 },
    { name: 'Beauty & Personal Care', min: 150, max: 5_000 },
    { name: 'Books', min: 120, max: 2_500 },
    { name: 'Sports & Fitness', min: 350, max: 16_000 },
    { name: 'Toys & Games', min: 250, max: 8_000 },
    { name: 'Grocery', min: 60, max: 2_000 },
    { name: 'Footwear', min: 500, max: 12_000 },
    { name: 'Furniture', min: 2_000, max: 45_000 },
    { name: 'Automotive', min: 300, max: 24_000 },
    { name: 'Health & Wellness', min: 180, max: 7_500 },
];

const productAdjectives = [
    'Premium',
    'Classic',
    'Everyday',
    'Pro',
    'Compact',
    'Essential',
    'Urban',
    'Smart',
    'Heritage',
    'Flex',
];

const productNouns: Record<string, string[]> = {
    Electronics: ['Wireless Earbuds', 'Bluetooth Speaker', 'Smart Watch', 'Power Bank', 'LED Monitor', 'Tablet'],
    'Home & Kitchen': ['Pressure Cooker', 'Mixer Grinder', 'Storage Set', 'Water Bottle', 'Cookware Set', 'Air Fryer'],
    Fashion: ['Cotton Kurta', 'Linen Shirt', 'Denim Jacket', 'Printed Saree', 'Everyday Backpack', 'Wool Shawl'],
    'Beauty & Personal Care': ['Face Serum', 'Hair Dryer', 'Skin Care Kit', 'Beard Trimmer', 'Bath Set', 'Sunscreen'],
    Books: ['Business Paperback', 'Mystery Novel', 'Cookbook', 'Exam Guide', "Children's Storybook", 'Travel Journal'],
    'Sports & Fitness': [
        'Yoga Mat',
        'Cricket Bat',
        'Resistance Bands',
        'Running Shoes',
        'Fitness Tracker',
        'Dumbbell Set',
    ],
    'Toys & Games': ['Building Blocks', 'Board Game', 'Remote Control Car', 'Puzzle Set', 'Learning Kit', 'Plush Toy'],
    Grocery: ['Tea Gift Pack', 'Organic Rice', 'Spice Box', 'Dry Fruit Mix', 'Coffee Beans', 'Millet Essentials'],
    Footwear: [
        'Running Sneakers',
        'Leather Sandals',
        'Daily Wear Loafers',
        'Walking Shoes',
        'Canvas Trainers',
        'Formal Shoes',
    ],
    Furniture: ['Study Desk', 'Bookshelf', 'Dining Chair', 'Bedside Table', 'Office Chair', 'Storage Cabinet'],
    Automotive: ['Car Phone Mount', 'Helmet', 'Dash Camera', 'Tyre Inflator', 'Seat Cover Set', 'Tool Kit'],
    'Health & Wellness': [
        'Digital Thermometer',
        'Massage Gun',
        'Sleep Support Kit',
        'First Aid Box',
        'Pulse Oximeter',
        'Wellness Pack',
    ],
};

const sellerPrefixes = ['Bazaar', 'Indi', 'Urban', 'Lotus', 'Mango', 'Nova', 'Cedar', 'Everest', 'Aarohi', 'Bluebird'];
const sellerSuffixes = ['Retail', 'Goods', 'Market', 'Living', 'Crafts', 'Direct'];
const statuses = ['delivered', 'shipped', 'processing', 'canceled', 'returned'] as const;
const paymentTypes = ['credit_card', 'upi', 'debit_card', 'voucher', 'cash_on_delivery'] as const;

type Location = (typeof locations)[number];

function createRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        let value = (state += 0x6d2b79f5);
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
}

function choose<T>(items: readonly T[], random: () => number): T {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) throw new Error('Cannot choose from an empty list.');
    return item;
}

function integer(min: number, max: number, random: () => number): number {
    return min + Math.floor(random() * (max - min + 1));
}

function rounded(value: number): number {
    return Math.round(value * 100) / 100;
}

function timestamp(date: Date): string {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function randomTimestamp(startMs: number, endMs: number, random: () => number): string {
    return timestamp(new Date(startMs + Math.floor(random() * (endMs - startMs + 1))));
}

function purchaseDate(random: () => number): Date {
    const months = Array.from({ length: 24 }, (_, index) => {
        const seasonalBoost = index % 12 >= 10 ? 2.1 : 1;
        return (1 + index * 0.035) * seasonalBoost;
    });
    const totalWeight = months.reduce((sum, weight) => sum + weight, 0);
    let selected = random() * totalWeight;
    let monthIndex = 0;
    for (; monthIndex < months.length - 1; monthIndex++) {
        selected -= months[monthIndex] ?? 0;
        if (selected < 0) break;
    }
    const year = 2024 + Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    const day = integer(1, new Date(Date.UTC(year, month + 1, 0)).getUTCDate(), random);
    return new Date(Date.UTC(year, month, day, integer(8, 22, random), integer(0, 59, random), integer(0, 59, random)));
}

function batchInsert<T>(
    database: Database.Database,
    rows: readonly T[],
    batchSize: number,
    insert: (row: T, index: number) => void
): void {
    const insertBatch = database.transaction((batch: readonly T[], startIdx: number) => {
        batch.forEach((row, i) => insert(row, startIdx + i));
    });
    for (let offset = 0; offset < rows.length; offset += batchSize) {
        insertBatch(rows.slice(offset, offset + batchSize), offset);
    }
}

function createSchema(database: Database.Database): void {
    database.exec(`
        CREATE TABLE customers (
            customer_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            city TEXT NOT NULL,
            state TEXT NOT NULL,
            region TEXT NOT NULL,
            signup_date TEXT NOT NULL
        );
        CREATE INDEX idx_customers_region ON customers(region);
        CREATE INDEX idx_customers_city ON customers(city);
        CREATE INDEX idx_customers_state ON customers(state);
        CREATE INDEX idx_customers_signup_date ON customers(signup_date);

        CREATE TABLE sellers (
            seller_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            city TEXT NOT NULL,
            state TEXT NOT NULL,
            region TEXT NOT NULL,
            joined_date TEXT NOT NULL
        );
        CREATE INDEX idx_sellers_region ON sellers(region);
        CREATE INDEX idx_sellers_city ON sellers(city);
        CREATE INDEX idx_sellers_state ON sellers(state);

        CREATE TABLE products (
            product_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            seller_id TEXT NOT NULL REFERENCES sellers(seller_id),
            price REAL NOT NULL CHECK (price > 0),
            cost REAL NOT NULL CHECK (cost > 0 AND cost < price),
            created_at TEXT NOT NULL,
            UNIQUE (product_id, seller_id)
        );
        CREATE INDEX idx_products_category ON products(category);
        CREATE INDEX idx_products_seller_id ON products(seller_id);

        CREATE TABLE orders (
            order_id TEXT PRIMARY KEY,
            id TEXT NOT NULL,
            customer_id TEXT NOT NULL REFERENCES customers(customer_id),
            status TEXT NOT NULL,
            order_status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            order_purchase_timestamp TEXT NOT NULL,
            order_delivered_timestamp TEXT,
            total REAL NOT NULL DEFAULT 0,
            payment_type TEXT NOT NULL
        );
        CREATE INDEX idx_orders_customer_id ON orders(customer_id);
        CREATE INDEX idx_orders_order_status ON orders(order_status);
        CREATE INDEX idx_orders_payment_type ON orders(payment_type);
        CREATE INDEX idx_orders_purchase_timestamp ON orders(order_purchase_timestamp);

        CREATE TABLE order_items (
            order_item_id INTEGER PRIMARY KEY,
            order_id TEXT NOT NULL REFERENCES orders(order_id),
            product_id TEXT NOT NULL,
            seller_id TEXT NOT NULL,
            quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 4),
            price REAL NOT NULL CHECK (price > 0),
            freight_value REAL NOT NULL CHECK (freight_value >= 0),
            FOREIGN KEY (product_id, seller_id) REFERENCES products(product_id, seller_id)
        );
        CREATE INDEX idx_order_items_order_id ON order_items(order_id);
        CREATE INDEX idx_order_items_product_id ON order_items(product_id);
        CREATE INDEX idx_order_items_seller_id ON order_items(seller_id);

        CREATE TABLE reviews (
            review_id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL UNIQUE REFERENCES orders(order_id),
            rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
            created_at TEXT NOT NULL
        );
        CREATE INDEX idx_reviews_order_id ON reviews(order_id);
        CREATE INDEX idx_reviews_rating ON reviews(rating);
        CREATE INDEX idx_reviews_created_at ON reviews(created_at);
    `);
}

export interface DemoCustomer {
    customer_id: string;
    name: string;
    email: string;
    city: string;
    state: string;
    region: string;
    signup_date: string;
}

export interface DemoSeller {
    seller_id: string;
    name: string;
    city: string;
    state: string;
    region: string;
    joined_date: string;
}

export interface DemoProduct {
    product_id: string;
    name: string;
    category: string;
    seller_id: string;
    price: number;
    cost: number;
    created_at: string;
}

export interface DemoOrder {
    id: string;
    order_id: string;
    customer_id: string;
    status: (typeof statuses)[number];
    order_status: (typeof statuses)[number];
    created_at: string;
    order_purchase_timestamp: string;
    order_delivered_timestamp: string | null;
    total: number;
    payment_type: (typeof paymentTypes)[number];
}

export interface DemoOrderItem {
    order_id: string;
    product_id: string;
    seller_id: string;
    quantity: number;
    price: number;
    freight_value: number;
}

export interface DemoReview {
    review_id: string;
    order_id: string;
    rating: number;
    created_at: string;
}

export interface DemoDataset {
    customers: DemoCustomer[];
    sellers: DemoSeller[];
    products: DemoProduct[];
    orders: DemoOrder[];
    orderItems: DemoOrderItem[];
    reviews: DemoReview[];
}

export function generateDataset(options?: { seed?: number; orderCount?: number }): DemoDataset {
    const random = createRandom(options?.seed ?? SEED);

    const customers: DemoCustomer[] = Array.from({ length: 2_000 }, (_, index) => {
        const customerId = `CUS${String(index + 1).padStart(5, '0')}`;
        const location = choose<Location>(locations, random);
        const firstName = choose(firstNames, random);
        const lastName = choose(lastNames, random);
        return {
            customer_id: customerId,
            name: `${firstName} ${lastName}`,
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${index + 1}@example.in`,
            city: location.city,
            state: location.state,
            region: location.region,
            signup_date: randomTimestamp(Date.UTC(2022, 0, 1), Date.UTC(2025, 11, 31), random),
        };
    });

    const sellers: DemoSeller[] = Array.from({ length: 60 }, (_, index) => {
        const sellerId = `SEL${String(index + 1).padStart(3, '0')}`;
        const location = choose(locations, random);
        return {
            seller_id: sellerId,
            name: `${choose(sellerPrefixes, random)} ${choose(sellerSuffixes, random)} ${String(index + 1).padStart(2, '0')}`,
            city: location.city,
            state: location.state,
            region: location.region,
            joined_date: randomTimestamp(Date.UTC(2022, 0, 1), Date.UTC(2023, 11, 31), random),
        };
    });

    const products: DemoProduct[] = Array.from({ length: 400 }, (_, index) => {
        const category = choose(categories, random);
        const seller = choose(sellers, random);
        const price = rounded(integer(category.min, category.max, random));
        const nounOptions = productNouns[category.name];
        if (!nounOptions) throw new Error(`No product names are configured for ${category.name}.`);
        const noun = choose(nounOptions, random);
        const margin = 0.55 + random() * 0.25;
        return {
            product_id: `PRD${String(index + 1).padStart(4, '0')}`,
            name: `${choose(productAdjectives, random)} ${noun}`,
            category: category.name,
            seller_id: seller.seller_id,
            price,
            cost: rounded(price * margin),
            created_at: randomTimestamp(Date.UTC(2023, 0, 1), Date.UTC(2025, 11, 31), random),
        };
    });

    const orderRows: DemoOrder[] = [];
    const itemRows: DemoOrderItem[] = [];
    const reviewRows: DemoReview[] = [];
    const statusThresholds = [0.85, 0.9, 0.95, 0.98, 1];

    const targetOrderCount = options?.orderCount ?? DEFAULT_ORDER_COUNT;
    for (let index = 0; index < targetOrderCount; index++) {
        const orderId = `ORD${String(index + 1).padStart(6, '0')}`;
        const customer = choose(customers, random);
        const purchase = purchaseDate(random);
        const statusRoll = random();
        const statusIndex = statusThresholds.findIndex((threshold) => statusRoll < threshold);
        const status = statuses[statusIndex < 0 ? statuses.length - 1 : statusIndex];
        if (!status) throw new Error('Order status was not found.');
        const delivered = status === 'delivered';
        const deliveredAt = delivered
            ? timestamp(new Date(purchase.getTime() + integer(1, 8, random) * 86_400_000))
            : null;
        const itemCount = integer(1, 4, random);
        let orderTotal = 0;
        for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
            const product = choose(products, random);
            const quantity = integer(1, 4, random);
            const price = rounded(product.price * (0.9 + random() * 0.1));
            const freight = rounded(integer(35, 480, random) + random());
            orderTotal += price * quantity + freight;
            itemRows.push({
                order_id: orderId,
                product_id: product.product_id,
                seller_id: product.seller_id,
                quantity,
                price,
                freight_value: freight,
            });
        }

        orderRows.push({
            id: orderId,
            order_id: orderId,
            customer_id: customer.customer_id,
            status,
            order_status: status,
            created_at: timestamp(purchase),
            order_purchase_timestamp: timestamp(purchase),
            order_delivered_timestamp: deliveredAt,
            total: rounded(orderTotal),
            payment_type: choose(paymentTypes, random),
        });

        if (delivered && random() < 0.6) {
            const ratingRoll = random();
            const rating =
                ratingRoll < 0.08 ? 1 : ratingRoll < 0.18 ? 2 : ratingRoll < 0.38 ? 3 : ratingRoll < 0.72 ? 4 : 5;
            const createdAt = new Date(purchase.getTime() + integer(2, 18, random) * 86_400_000);
            reviewRows.push({
                review_id: `REV${String(reviewRows.length + 1).padStart(6, '0')}`,
                order_id: orderId,
                rating,
                created_at: timestamp(createdAt),
            });
        }
    }

    return {
        customers,
        sellers,
        products,
        orders: orderRows,
        orderItems: itemRows,
        reviews: reviewRows,
    };
}

export function seedDemoDatabase(options?: { orderCount?: number }): void {
    assertTestIsolationGuard(SAMPLE_DB_PATH);
    const startedAt = performance.now();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const candidate of [SAMPLE_DB_PATH, `${SAMPLE_DB_PATH}-wal`, `${SAMPLE_DB_PATH}-shm`]) {
        fs.rmSync(candidate, { force: true });
    }

    const database = new Database(SAMPLE_DB_PATH);
    try {
        database.pragma('foreign_keys = ON');
        database.pragma('journal_mode = DELETE');
        createSchema(database);

        const dataset = generateDataset(options);

        const customerInsert = database.prepare(
            'INSERT INTO customers (customer_id, name, email, city, state, region, signup_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        batchInsert(database, dataset.customers, BATCH_SIZE, (row) => {
            customerInsert.run(
                row.customer_id,
                row.name,
                row.email,
                row.city,
                row.state,
                row.region,
                row.signup_date
            );
        });

        const sellerInsert = database.prepare(
            'INSERT INTO sellers (seller_id, name, city, state, region, joined_date) VALUES (?, ?, ?, ?, ?, ?)'
        );
        batchInsert(database, dataset.sellers, BATCH_SIZE, (row) => {
            sellerInsert.run(
                row.seller_id,
                row.name,
                row.city,
                row.state,
                row.region,
                row.joined_date
            );
        });

        const productInsert = database.prepare(
            'INSERT INTO products (product_id, name, category, seller_id, price, cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        batchInsert(database, dataset.products, BATCH_SIZE, (row) => {
            productInsert.run(
                row.product_id,
                row.name,
                row.category,
                row.seller_id,
                row.price,
                row.cost,
                row.created_at
            );
        });

        const orderInsert = database.prepare(
            'INSERT INTO orders (id, order_id, customer_id, status, order_status, created_at, order_purchase_timestamp, order_delivered_timestamp, total, payment_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        batchInsert(database, dataset.orders, BATCH_SIZE, (row) => {
            orderInsert.run(
                row.id,
                row.order_id,
                row.customer_id,
                row.status,
                row.order_status,
                row.created_at,
                row.order_purchase_timestamp,
                row.order_delivered_timestamp,
                row.total,
                row.payment_type
            );
        });

        const itemInsert = database.prepare(
            'INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, freight_value) VALUES (?, ?, ?, ?, ?, ?)'
        );
        batchInsert(database, dataset.orderItems, BATCH_SIZE, (row) => {
            itemInsert.run(
                row.order_id,
                row.product_id,
                row.seller_id,
                row.quantity,
                row.price,
                row.freight_value
            );
        });

        const reviewInsert = database.prepare(
            'INSERT INTO reviews (review_id, order_id, rating, created_at) VALUES (?, ?, ?, ?)'
        );
        batchInsert(database, dataset.reviews, BATCH_SIZE, (row) => {
            reviewInsert.run(row.review_id, row.order_id, row.rating, row.created_at);
        });

        const integrity = database.pragma('foreign_key_check') as unknown[];
        if (integrity.length > 0) throw new Error('Generated sample data contains orphan foreign keys.');
        const deliveredCount = dataset.orders.filter((order) => order.status === 'delivered').length;
        console.log(
            `Seeded ${dataset.orders.length.toLocaleString()} orders, ${dataset.orderItems.length.toLocaleString()} items, and ${dataset.reviews.length.toLocaleString()} reviews (${deliveredCount.toLocaleString()} delivered) in ${((performance.now() - startedAt) / 1_000).toFixed(1)}s.`
        );
    } catch (error) {
        database.close();
        throw error;
    }
    database.close();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        seedDemoDatabase();
    } catch (error) {
        console.error('Demo data seed failed:', error);
        process.exitCode = 1;
    }
}
