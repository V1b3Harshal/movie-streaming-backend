import { User, CreateUserInput } from '../models/user';
import bcrypt from 'bcrypt';
import { getDb } from '../config/database';

// Hash password with bcrypt
const hashPassword = async (password: string) => {
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  return await bcrypt.hash(password, saltRounds);
};

// Compare password with hashed password
const comparePassword = async (password: string, hashedPassword: string) => {
  return await bcrypt.compare(password, hashedPassword);
};

export const createUser = async (userData: CreateUserInput): Promise<User> => {
  const db = getDb();
  const hashedPassword = await hashPassword(userData.password);
  
  const newUser: User = {
    id: crypto.randomUUID(),
    email: userData.email,
    username: userData.username,
    password: hashedPassword,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  await db.collection('users').insertOne(newUser);
  return newUser;
};

export const findUserByEmail = async (email: string): Promise<User | undefined> => {
  const db = getDb();
  const user = await db.collection('users').findOne({ email });
  return user as User | undefined;
};

export const findUserById = async (id: string): Promise<User | undefined> => {
  const db = getDb();
  const user = await db.collection('users').findOne({ id });
  return user as User | undefined;
};

export const verifyUserPassword = async (user: User, password: string) => {
  return comparePassword(password, user.password);
};