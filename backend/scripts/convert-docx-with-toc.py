"""Atualiza os sumários no Writer antes de salvar o Word e exportar o PDF."""

import sys
import time
from pathlib import Path

import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.document.MacroExecMode import NEVER_EXECUTE
from com.sun.star.document.UpdateDocMode import NO_UPDATE


def property_value(name, value):
    prop = PropertyValue()
    prop.Name = name
    prop.Value = value
    return prop


def preserve_index_format(document, index):
    """Usa a formatação visível do modelo ao reconstruir as entradas."""
    paragraphs = index.getAnchor().createEnumeration()
    while paragraphs.hasMoreElements():
        paragraph = paragraphs.nextElement()
        if paragraph.getString().strip():
            break
    else:
        return
    cursor = document.Text.createTextCursorByRange(paragraph.getStart())
    cursor.goRight(1, True)
    style = document.StyleFamilies.getByName("ParagraphStyles").getByName(index.ParaStyleLevel1)
    for name in ["CharFontName", "CharHeight", "CharWeight", "CharColor"]:
        style.setPropertyValue(name, cursor.getPropertyValue(name))
    for name in ["ParaTopMargin", "ParaBottomMargin", "ParaLineSpacing"]:
        style.setPropertyValue(name, paragraph.getPropertyValue(name))
    tabs = paragraph.ParaTabStops
    if not tabs:
        return
    # O Writer importa o campo TOC com seu próprio padrão de pontilhados.
    # Recria os separadores a partir das tabulações do modelo final.
    pattern = [
        [("TokenType", "TokenHyperlinkStart"), ("CharacterStyleName", "Index Link")],
        [("TokenType", "TokenEntryNumber")],
        [("TokenType", "TokenTabStop"), ("TabStopPosition", tabs[0].Position),
         ("TabStopRightAligned", False), ("TabStopFillCharacter", tabs[0].FillChar.value), ("WithTab", True)],
        [("TokenType", "TokenEntryText")],
        [("TokenType", "TokenTabStop"), ("TabStopRightAligned", True),
         ("TabStopFillCharacter", tabs[-1].FillChar.value), ("WithTab", True)],
        [("TokenType", "TokenPageNumber")],
        [("TokenType", "TokenHyperlinkEnd")]
    ]
    tokens = tuple(tuple(property_value(name, value) for name, value in token) for token in pattern)
    uno.invoke(index.LevelFormat, "replaceByIndex", (
        1, uno.Any("[][]com.sun.star.beans.PropertyValue", tokens)
    ))


def convert(pipe, docx_path, pdf_path):
    local_context = uno.getComponentContext()
    resolver = local_context.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", local_context
    )
    deadline = time.monotonic() + 30
    while True:
        try:
            context = resolver.resolve(
                f"uno:pipe,name={pipe};urp;StarOffice.ComponentContext"
            )
            break
        except uno.getClass("com.sun.star.connection.NoConnectException"):
            if time.monotonic() >= deadline:
                raise TimeoutError("O LibreOffice não iniciou para atualizar o sumário.")
            time.sleep(0.1)

    desktop = context.ServiceManager.createInstanceWithContext(
        "com.sun.star.frame.Desktop", context
    )
    document = None
    try:
        document = desktop.loadComponentFromURL(
            Path(docx_path).as_uri(), "_blank", 0,
            tuple(property_value(name, value) for name, value in [
                ("Hidden", True), ("ReadOnly", False),
                ("MacroExecutionMode", NEVER_EXECUTE), ("UpdateDocMode", NO_UPDATE)
            ])
        )
        if document is None:
            raise RuntimeError("O LibreOffice não abriu a proposta.")
        indexes = document.getDocumentIndexes()
        if indexes.getCount() == 0:
            raise RuntimeError("O LibreOffice não reconheceu o sumário da proposta.")
        for index in range(indexes.getCount()):
            preserve_index_format(document, indexes.getByIndex(index))
        # A primeira atualização pode aumentar o sumário e deslocar os capítulos.
        # A segunda recalcula as páginas depois dessa mudança de tamanho.
        for _ in range(2):
            document.refresh()
            for index in range(indexes.getCount()):
                indexes.getByIndex(index).update()
        document.store()
        document.storeToURL(Path(pdf_path).as_uri(), (
            property_value("FilterName", "writer_pdf_Export"),
            property_value("Overwrite", True)
        ))
    finally:
        if document is not None:
            document.close(True)
        desktop.terminate()


if __name__ == "__main__":
    convert(*sys.argv[1:])
