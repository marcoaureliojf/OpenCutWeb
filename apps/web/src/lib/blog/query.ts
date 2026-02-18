import type {
	MarbleAuthorList,
	MarbleCategoryList,
	MarblePost,
	MarblePostList,
	MarbleTagList,
} from "@/types/blog";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSanitize from "rehype-sanitize";

const url =
	process.env.NEXT_PUBLIC_MARBLE_API_URL ?? "https://api.marblecms.com";
const key = process.env.MARBLE_WORKSPACE_KEY ?? "cmd4iw9mm0006l804kwqv0k46";

async function fetchFromMarble<T>({
	endpoint,
}: {
	endpoint: string;
}): Promise<T | null> {
	try {
		const response = await fetch(`${url}/${key}/${endpoint}`);
		if (!response.ok) {
			console.warn(
				`Failed to fetch ${endpoint}: ${response.status} ${response.statusText}`,
			);
			return null;
		}
		return (await response.json()) as T;
	} catch (error) {
		console.error(`Error fetching ${endpoint}:`, error);
		return null;
	}
}

export async function getPosts() {
	const data = await fetchFromMarble<MarblePostList>({ endpoint: "posts" });
	return data ?? { posts: [], total: 0 };
}

export async function getTags() {
	const data = await fetchFromMarble<MarbleTagList>({ endpoint: "tags" });
	return data ?? { tags: [] };
}

export async function getSinglePost({ slug }: { slug: string }) {
	return fetchFromMarble<MarblePost>({ endpoint: `posts/${slug}` });
}

export async function getCategories() {
	const data = await fetchFromMarble<MarbleCategoryList>({
		endpoint: "categories",
	});
	return data ?? { categories: [] };
}

export async function getAuthors() {
	const data = await fetchFromMarble<MarbleAuthorList>({ endpoint: "authors" });
	return data ?? { authors: [] };
}

export async function processHtmlContent({
	html,
}: {
	html: string;
}): Promise<string> {
	const processor = unified()
		.use(rehypeSanitize)
		.use(rehypeParse, { fragment: true })
		.use(rehypeSlug)
		.use(rehypeAutolinkHeadings, { behavior: "append" })
		.use(rehypeStringify);

	const file = await processor.process({ value: html, type: "html" });
	return String(file);
}
