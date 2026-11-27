import Head from "next/head";
import { readme } from "kit/readme.ts";
import { Nav } from "../../components/Learn";

export const getStaticProps = () => ({ props: readme() });

export default function Learn({ title, description, html }: ReturnType<typeof readme>) {
  return (
    <>
      <Head>
        <title>{`${title}: how to play well`}</title>
        <meta name="description" content={description} />
      </Head>
      <Nav className="mx-auto max-w-[48rem] px-2 pt-4" />
      <main className="learn" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
