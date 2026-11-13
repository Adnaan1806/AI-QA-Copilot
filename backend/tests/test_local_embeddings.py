"""Knowledge search embeds text locally (no API key) and ranks by meaning, not shared words."""

import uuid

from langchain_chroma import Chroma

from app.rag.vector_store import LocalEmbeddings, relevance


def test_search_ranks_by_meaning():
    store = Chroma(
        collection_name=f"test-{uuid.uuid4().hex}",
        embedding_function=LocalEmbeddings(),
        collection_metadata={"hnsw:space": "cosine"},
        relevance_score_fn=relevance,
    )
    store.add_texts(
        [
            "The card is declined at purchase when the bank refuses the payment.",
            "Products can be sorted by name or by price, low to high.",
            "The footer links to the privacy policy and terms of service.",
        ],
        ids=["payment", "sorting", "footer"],
    )

    top = store.similarity_search_with_relevance_scores("checkout fails when paying", k=3)

    assert top[0][0].page_content.startswith("The card is declined")
    assert top[0][1] > top[1][1]
    assert all(0 <= score <= 1 for _, score in top)


def test_embeddings_have_one_vector_per_text():
    embeddings = LocalEmbeddings()
    vectors = embeddings.embed_documents(["first", "second"])

    assert len(vectors) == 2 and len(vectors[0]) == len(embeddings.embed_query("third"))
    assert embeddings.embed_documents([]) == []
