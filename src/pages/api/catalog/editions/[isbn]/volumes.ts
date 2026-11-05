import type { APIRoute } from 'astro';
import { answerVolumes } from '../../../../../lib/catalog/api';
import { catalog } from '../../../../../lib/catalog/instance';

export const GET: APIRoute = ({ params }) => answerVolumes(catalog(), params.isbn);
