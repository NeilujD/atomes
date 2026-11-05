import type { APIRoute } from 'astro';
import { answerCover } from '../../../../../lib/catalog/api';
import { catalog } from '../../../../../lib/catalog/instance';

export const GET: APIRoute = ({ params }) => answerCover(catalog(), params.isbn);
