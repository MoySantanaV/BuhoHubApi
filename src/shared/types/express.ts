import type { Request, Response, NextFunction } from 'express';
import type { IUser } from '../../modules/user/userAuthModel.js';
import type { IUserProfile } from '../../modules/user/userModel.js';

// Declaration merging: tipa lo que authenticate/passport agregan a la request
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface User extends IUser {}
        interface Request {
            userProfile?: IUserProfile;
        }
    }
}

export type Req = Request;
export type Res = Response;
export type Next = NextFunction;
