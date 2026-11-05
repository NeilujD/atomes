import type { APIRoute } from 'astro';
import { answerEdition } from '../../../../lib/catalog/api';
import { catalog } from '../../../../lib/catalog/instance';

export const GET: APIRoute = ({ params }) => answerEdition(catalog(), params.isbn);
